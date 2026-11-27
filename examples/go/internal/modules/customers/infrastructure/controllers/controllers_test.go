package controllers

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/application/ports/input"
	"example.com/shop/internal/modules/customers/domain"
)

// translate looks the key up in the module's own catalog. A test of this package may not import platform/i18n
// (infrastructure never depends on platform), so it carries the few lines it needs.
func translate(locale, key string, params map[string]string) string {
	text := Messages[locale][key]
	for name, value := range params {
		text = strings.ReplaceAll(text, "{"+name+"}", value)
	}
	return text
}

type failing struct{ err error }

func (f failing) Execute(context.Context, interactors.RegisterCustomerRequest) (interactors.RegisterCustomerResponse, error) {
	return interactors.RegisterCustomerResponse{}, f.err
}

func post(c *RegisterCustomer, body, locale string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	c.Handle(rec, httptest.NewRequest(http.MethodPost, "/customers", strings.NewReader(body)), locale)
	return rec
}

func TestKnownFailuresBecomeAStatusACodeAndATextInTheRequestLanguage(t *testing.T) {
	cases := []struct {
		err    error
		locale string
		status int
		body   string
	}{
		{&domain.InvalidCustomerError{Reason: domain.ReasonInvalidEmail, Detail: "log text"}, "es", http.StatusBadRequest,
			`{"code":"INVALID_CUSTOMER","message":"El email del cliente no es válido"}`},
		{&interactors.EmailAlreadyRegisteredError{Email: "a@b.co"}, "en", http.StatusConflict,
			`{"code":"EMAIL_ALREADY_REGISTERED","message":"Email a@b.co is already registered"}`},
	}
	for _, tc := range cases {
		rec := post(NewRegisterCustomer(failing{tc.err}, translate), `{"name":"Ada","email":"a@b.co"}`, tc.locale)
		if rec.Code != tc.status || strings.TrimSpace(rec.Body.String()) != tc.body {
			t.Fatalf("%v: want %d %s, got %d %s", tc.err, tc.status, tc.body, rec.Code, rec.Body.String())
		}
	}
}

func TestAMalformedBodyIsAnsweredInTheRequestLanguage(t *testing.T) {
	rec := post(NewRegisterCustomer(failing{}, translate), `{`, "es")
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), `"message":"JSON mal formado"`) {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}

func TestAnUnexpectedFailurePanicsForTheRecoveryMiddleware(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("an unexpected error must not be answered here")
		}
	}()
	post(NewRegisterCustomer(failing{errors.New("database is locked")}, translate), `{}`, "en")
}

type found map[string]input.CustomerView

func (f found) Execute(_ context.Context, id string) (*input.CustomerView, error) {
	if v, ok := f[id]; ok {
		return &v, nil
	}
	return nil, nil
}

func TestGetAnswers404ForAnUnknownCustomer(t *testing.T) {
	controller := NewGetCustomer(found{"c-1": {ID: "c-1", Name: "Ada"}}, translate)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /customers/{id}", func(w http.ResponseWriter, r *http.Request) { controller.Handle(w, r, "es") })
	for path, status := range map[string]int{"/customers/c-1": 200, "/customers/ghost": 404} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != status {
			t.Fatalf("%s: want %d, got %d", path, status, rec.Code)
		}
		if status == 404 && !strings.Contains(rec.Body.String(), `"message":"No existe el cliente ghost"`) {
			t.Fatalf("got %s", rec.Body.String())
		}
	}
}
