package controllers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/application/ports/input"
	"example.com/shop/internal/modules/customers/domain"
)

type failing struct{ err error }

func (f failing) Execute(context.Context, interactors.RegisterCustomerRequest) (interactors.RegisterCustomerResponse, error) {
	return interactors.RegisterCustomerResponse{}, f.err
}

func post(h http.Handler, body string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/customers", strings.NewReader(body)))
	return rec
}

func TestKnownFailuresBecomeStatuses(t *testing.T) {
	cases := map[int]error{
		http.StatusBadRequest: fmt.Errorf("%w: Customer email is not valid", domain.ErrInvalidCustomer),
		http.StatusConflict:   &interactors.EmailAlreadyRegisteredError{Email: "a@b.co"},
	}
	for status, err := range cases {
		if rec := post(NewRegisterCustomer(failing{err}), `{"name":"Ada","email":"a@b.co"}`); rec.Code != status {
			t.Fatalf("%v: want %d, got %d", err, status, rec.Code)
		}
	}
}

func TestTheDomainMessageIsSentWithoutItsWrappingPrefix(t *testing.T) {
	rec := post(NewRegisterCustomer(failing{fmt.Errorf("%w: Customer email is not valid", domain.ErrInvalidCustomer)}), `{}`)
	if !strings.Contains(rec.Body.String(), `"message":"Customer email is not valid"`) {
		t.Fatalf("got %s", rec.Body.String())
	}
}

func TestAnUnexpectedFailurePanicsForTheRecoveryMiddleware(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("an unexpected error must not be answered here")
		}
	}()
	post(NewRegisterCustomer(failing{errors.New("database is locked")}), `{}`)
}

type found map[string]input.CustomerView

func (f found) Execute(_ context.Context, id string) (*input.CustomerView, error) {
	if v, ok := f[id]; ok {
		return &v, nil
	}
	return nil, nil
}

func TestGetAnswers404ForAnUnknownCustomer(t *testing.T) {
	mux := http.NewServeMux()
	mux.Handle("GET /customers/{id}", NewGetCustomer(found{"c-1": {ID: "c-1", Name: "Ada"}}))
	for path, status := range map[string]int{"/customers/c-1": 200, "/customers/ghost": 404} {
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != status {
			t.Fatalf("%s: want %d, got %d", path, status, rec.Code)
		}
	}
}
