# Presenter — Go

Files: `internal/modules/<module>/infrastructure/presenters/<name>.go` (package `presenters`), view model beside it; the humble handler in `internal/platform/web/`. The presenter satisfies the Output Port interface implicitly; `var _ output.PlaceOrderOutput = (*PlaceOrder)(nil)` makes the compiler check it.

## View model and presenter — the testable half

```go
// internal/modules/orders/infrastructure/presenters/place_order.go
// May import this module's application/ and domain/ and internal/shared; never platform/, bootstrap/, net/http or other modules.
package presenters

import (
	"errors"
	"fmt"

	"example.com/shop/internal/modules/orders/application/interactors"
	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/domain"
)

// ViewModel is plain data formatted for the response.
type ViewModel struct {
	OrderID     string `json:"orderId"`
	StatusLabel string `json:"statusLabel"` // "Pending" instead of "PENDING"
	Total       string `json:"total"`       // "$25.00" instead of 2500 (cents)
}

type ErrorCode string

const (
	CustomerNotFound ErrorCode = "CUSTOMER_NOT_FOUND"
	InvalidOrder     ErrorCode = "INVALID_ORDER"
	UnknownError     ErrorCode = "UNKNOWN_ERROR"
)

type ErrorViewModel struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
}

var statusLabels = map[string]string{"PENDING": "Pending", "CANCELLED": "Cancelled"}

type PlaceOrder struct {
	ViewModel      *ViewModel
	ErrorViewModel *ErrorViewModel
}

var _ output.PlaceOrderOutput = (*PlaceOrder)(nil)

func (p *PlaceOrder) Present(r output.PlaceOrderResult) {
	label, ok := statusLabels[r.Status]
	if !ok {
		label = r.Status
	}
	p.ViewModel = &ViewModel{OrderID: r.OrderID, StatusLabel: label, Total: fmt.Sprintf("$%d.%02d", r.TotalCents/100, r.TotalCents%100)}
}

func (p *PlaceOrder) PresentError(err error) {
	var notFound *interactors.CustomerNotFoundError
	switch {
	case errors.As(err, &notFound):
		p.ErrorViewModel = &ErrorViewModel{Code: CustomerNotFound, Message: err.Error()}
	case errors.Is(err, domain.ErrInvalidOrder):
		p.ErrorViewModel = &ErrorViewModel{Code: InvalidOrder, Message: err.Error()}
	default: // never leak the message of an unexpected failure
		p.ErrorViewModel = &ErrorViewModel{Code: UnknownError, Message: "Unexpected error"}
	}
}
```

## The view — the humble half, in platform/web

```go
// internal/platform/web/place_order_route.go
// Thin: reads what the presenter prepared and sends it. bootstrap builds a NEW presenter per request.
package web

import (
	"encoding/json"
	"net/http"

	orderspresenters "example.com/shop/internal/modules/orders/infrastructure/presenters"
)

var statusByCode = map[orderspresenters.ErrorCode]int{
	orderspresenters.CustomerNotFound: http.StatusNotFound,
	orderspresenters.InvalidOrder:     http.StatusBadRequest,
	orderspresenters.UnknownError:     http.StatusInternalServerError,
}

// PlaceOrderHandler gets a factory that returns a fresh presenter and a controller bound to it.
func PlaceOrderHandler(make func() (*orderspresenters.PlaceOrder, func(*http.Request))) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		presenter, handle := make()
		handle(r)
		w.Header().Set("Content-Type", "application/json")
		if e := presenter.ErrorViewModel; e != nil {
			w.WriteHeader(statusByCode[e.Code])
			_ = json.NewEncoder(w).Encode(e)
			return
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(presenter.ViewModel)
	}
}
```

## Test — no HTTP stack

```go
// internal/modules/orders/infrastructure/presenters/place_order_test.go
package presenters

import (
	"errors"
	"testing"

	"example.com/shop/internal/modules/orders/application/interactors"
	"example.com/shop/internal/modules/orders/application/ports/output"
)

func TestPresentFormatsTheResult(t *testing.T) {
	p := &PlaceOrder{}
	p.Present(output.PlaceOrderResult{OrderID: "o-1", Status: "PENDING", TotalCents: 2550})
	if p.ViewModel.StatusLabel != "Pending" || p.ViewModel.Total != "$25.50" {
		t.Fatalf("got %+v", p.ViewModel)
	}
}

func TestPresentErrorMapsTypedErrorsAndHidesTheRest(t *testing.T) {
	p := &PlaceOrder{}
	p.PresentError(&interactors.CustomerNotFoundError{CustomerID: "c-9"})
	if p.ErrorViewModel.Code != CustomerNotFound {
		t.Fatalf("got %+v", p.ErrorViewModel)
	}
	p.PresentError(errors.New("pq: relation \"orders\" does not exist"))
	if p.ErrorViewModel.Message != "Unexpected error" {
		t.Fatalf("leaked %q", p.ErrorViewModel.Message)
	}
}
```
