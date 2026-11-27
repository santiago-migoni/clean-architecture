# Controller — Go

The complete, tested version of this code is [`examples/go`](../../../examples/go): the same application in every language.

Files: `internal/modules/<module>/infrastructure/controllers/<name>.go` (package `controllers`), or a subpackage named after the technology (`infrastructure/httpapi/`). `net/http` is the framework here: the controller has a `Handle(w, r, locale)` method, so it is tested with `httptest` and registered on a mux in `internal/platform/web/`, which negotiates the locale of each request (`Accept-Language` is an HTTP detail).

## Default style — the controller maps the response model to HTTP

```go
// internal/modules/orders/infrastructure/controllers/place_order.go
// May import this module's application/ and domain/ and internal/shared; never platform/, bootstrap/ or another module.
package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"example.com/shop/internal/modules/orders/application/interactors"
	"example.com/shop/internal/modules/orders/domain"
)

// PlaceOrderUseCase is what the controller needs; *interactors.PlaceOrder satisfies it.
type PlaceOrderUseCase interface {
	Execute(ctx context.Context, req interactors.PlaceOrderRequest) (interactors.PlaceOrderResponse, error)
}

// placeOrderHTTPRequest is the body exactly as it arrives (HTTP vocabulary: items).
type placeOrderHTTPRequest struct {
	CustomerID string `json:"customerId"`
	Items      []struct {
		ProductID      string `json:"productId"`
		Quantity       int    `json:"quantity"`
		UnitPriceCents int    `json:"unitPriceCents"`
	} `json:"items"`
}

// Translate turns a key into text for a locale. bootstrap injects platform/i18n's implementation.
type Translate func(locale, key string, params map[string]string) string

// Messages are the module's own texts, beside the adapter that writes them.
var Messages = map[string]map[string]string{
	"en": {"MALFORMED_JSON": "Malformed JSON", "CUSTOMER_NOT_FOUND": "Customer {customerId} not found", "INVALID_ORDER.NO_LINES": "Order must have at least one line"},
	"es": {"MALFORMED_JSON": "JSON mal formado", "CUSTOMER_NOT_FOUND": "No existe el cliente {customerId}", "INVALID_ORDER.NO_LINES": "El pedido debe tener al menos una línea"},
}

// errorBody is every failure answer: a stable code for programs, a text in the request's language for people.
type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type PlaceOrder struct {
	useCase PlaceOrderUseCase
	t       Translate
}

func NewPlaceOrder(useCase PlaceOrderUseCase, t Translate) *PlaceOrder {
	return &PlaceOrder{useCase: useCase, t: t}
}

func (c *PlaceOrder) Handle(w http.ResponseWriter, r *http.Request, locale string) {
	var body placeOrderHTTPRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, errorBody{"MALFORMED_JSON", c.t(locale, "MALFORMED_JSON", nil)})
		return
	}
	req := interactors.PlaceOrderRequest{CustomerID: body.CustomerID}
	for _, i := range body.Items {
		req.Lines = append(req.Lines, interactors.PlaceOrderLine{ProductID: i.ProductID, Quantity: i.Quantity, UnitPriceCents: i.UnitPriceCents})
	}

	res, err := c.useCase.Execute(r.Context(), req)
	var invalid *domain.InvalidOrderError
	var notFound *interactors.CustomerNotFoundError
	// By type and reason, never by the error's message (which is for logs).
	switch {
	case err == nil:
		writeJSON(w, http.StatusCreated, map[string]any{"orderId": res.OrderID, "status": res.Status, "totalCents": res.TotalCents})
	case errors.As(err, &invalid):
		writeJSON(w, http.StatusBadRequest, errorBody{"INVALID_ORDER", c.t(locale, "INVALID_ORDER."+string(invalid.Reason), nil)})
	case errors.As(err, &notFound):
		message := c.t(locale, "CUSTOMER_NOT_FOUND", map[string]string{"customerId": notFound.CustomerID})
		writeJSON(w, http.StatusNotFound, errorBody{"CUSTOMER_NOT_FOUND", message})
	default:
		panic(err) // unexpected: the recovery middleware in platform/web logs it and answers 500
	}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
```

## Route registration and the last-resort handler (platform/web)

```go
// internal/platform/web/server.go — framework wiring only; handlers come ready-made from bootstrap
package web

import (
	"encoding/json"
	"log"
	"net/http"

	"example.com/shop/internal/platform/i18n"
)

// LocalizedHandler answers a request in the locale negotiated here.
type LocalizedHandler interface {
	Handle(w http.ResponseWriter, r *http.Request, locale string)
}

type Handlers struct {
	PlaceOrder LocalizedHandler
}

var messages = i18n.Catalog{"en": {"UNKNOWN_ERROR": "Unexpected error"}, "es": {"UNKNOWN_ERROR": "Error inesperado"}}

// NewMux builds the routes. locales[0] is the default: the answer when the client asks for nothing the app speaks.
func NewMux(h Handlers, locales []string) http.Handler {
	t := i18n.New(messages, locales[0])
	localeOf := func(r *http.Request) string { return NegotiateLocale(r.Header.Get("Accept-Language"), locales) }
	mux := http.NewServeMux()
	mux.HandleFunc("POST /orders", func(w http.ResponseWriter, r *http.Request) { h.PlaceOrder.Handle(w, r, localeOf(r)) })
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				log.Printf("unhandled error: %v", v) // log it, never send it
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]string{"code": "UNKNOWN_ERROR", "message": t(localeOf(r), "UNKNOWN_ERROR", nil)})
			}
		}()
		mux.ServeHTTP(w, r)
	})
}
```

## Test — the use case is replaced, no server is started

```go
// internal/modules/orders/infrastructure/controllers/place_order_test.go
package controllers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"example.com/shop/internal/modules/orders/application/interactors"
	"example.com/shop/internal/modules/orders/domain"
)

// translate reads the module's own catalog: a test of this package may not import platform/i18n.
func translate(locale, key string, params map[string]string) string {
	text := Messages[locale][key]
	for name, value := range params {
		text = strings.ReplaceAll(text, "{"+name+"}", value)
	}
	return text
}

type failingUseCase struct{ err error }

func (f failingUseCase) Execute(context.Context, interactors.PlaceOrderRequest) (interactors.PlaceOrderResponse, error) {
	return interactors.PlaceOrderResponse{}, f.err
}

func TestInvalidOrderIs400WithItsCodeAndATextInTheRequestLanguage(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(`{"customerId":"c-1","items":[]}`))
	noLines := &domain.InvalidOrderError{Reason: domain.ReasonNoLines, Detail: "log text"}
	NewPlaceOrder(failingUseCase{noLines}, translate).Handle(rec, req, "es")
	want := `{"code":"INVALID_ORDER","message":"El pedido debe tener al menos una línea"}`
	if rec.Code != http.StatusBadRequest || strings.TrimSpace(rec.Body.String()) != want {
		t.Fatalf("got %d %s", rec.Code, rec.Body.String())
	}
}
```
