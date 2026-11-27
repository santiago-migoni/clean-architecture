# Controller — Go

The complete, tested version of this code is [`examples/go`](../../../examples/go): the same application in every language.

Files: `internal/modules/<module>/infrastructure/controllers/<name>.go` (package `controllers`), or a subpackage named after the technology (`infrastructure/httpapi/`). `net/http` is the framework here: the controller is an `http.Handler`, so it is tested with `httptest` and registered on a mux in `internal/platform/web/`.

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

type PlaceOrder struct{ useCase PlaceOrderUseCase }

func NewPlaceOrder(useCase PlaceOrderUseCase) *PlaceOrder { return &PlaceOrder{useCase: useCase} }

func (c *PlaceOrder) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var body placeOrderHTTPRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Malformed JSON"})
		return
	}
	req := interactors.PlaceOrderRequest{CustomerID: body.CustomerID}
	for _, i := range body.Items {
		req.Lines = append(req.Lines, interactors.PlaceOrderLine{ProductID: i.ProductID, Quantity: i.Quantity, UnitPriceCents: i.UnitPriceCents})
	}

	res, err := c.useCase.Execute(r.Context(), req)
	var notFound *interactors.CustomerNotFoundError
	switch {
	case err == nil:
		writeJSON(w, http.StatusCreated, map[string]any{"orderId": res.OrderID, "status": res.Status, "totalCents": res.TotalCents})
	case errors.Is(err, domain.ErrInvalidOrder):
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
	case errors.As(err, &notFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"message": err.Error()})
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
	"log"
	"net/http"
)

type Handlers struct {
	PlaceOrder http.Handler
}

func NewMux(h Handlers) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("POST /orders", h.PlaceOrder)
	return recoverUnexpected(mux)
}

func recoverUnexpected(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				log.Printf("unhandled error: %v", v) // log it, never send it
				http.Error(w, `{"message":"Unexpected error"}`, http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}
```

## Test — the use case is replaced, no server is started

```go
// internal/modules/orders/infrastructure/controllers/place_order_test.go
package controllers

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"example.com/shop/internal/modules/orders/application/interactors"
	"example.com/shop/internal/modules/orders/domain"
)

type failingUseCase struct{ err error }

func (f failingUseCase) Execute(context.Context, interactors.PlaceOrderRequest) (interactors.PlaceOrderResponse, error) {
	return interactors.PlaceOrderResponse{}, f.err
}

func TestInvalidOrderIs400(t *testing.T) {
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/orders", strings.NewReader(`{"customerId":"c-1","items":[]}`))
	NewPlaceOrder(failingUseCase{fmt.Errorf("%w: no lines", domain.ErrInvalidOrder)}).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d", rec.Code)
	}
}
```
