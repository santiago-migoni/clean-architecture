# Presenter — Go

The complete, tested version of this code is [`examples/go`](../../../examples/go): the same application in every language.

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

// Translate turns a key into text for a locale; bootstrap injects platform/i18n's implementation.
type Translate func(locale, key string, params map[string]string) string

// Messages are the module's own texts, beside the presenter that writes them.
var Messages = map[string]map[string]string{
	"en": {"STATUS.PENDING": "Pending", "CUSTOMER_NOT_FOUND": "Customer {customerId} not found", "INVALID_ORDER.NO_LINES": "Order must have at least one line", "UNKNOWN_ERROR": "Unexpected error"},
	"es": {"STATUS.PENDING": "Pendiente", "CUSTOMER_NOT_FOUND": "No existe el cliente {customerId}", "INVALID_ORDER.NO_LINES": "El pedido debe tener al menos una línea", "UNKNOWN_ERROR": "Error inesperado"},
}

// ViewModel is plain data formatted for the response.
type ViewModel struct {
	OrderID     string `json:"orderId"`
	StatusLabel string `json:"statusLabel"` // "Pending" (or "Pendiente") instead of "PENDING"
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
	Message string    `json:"message"` // in the request's language
}

type PlaceOrder struct {
	ViewModel      *ViewModel
	ErrorViewModel *ErrorViewModel
	t              Translate
	locale         string
}

var _ output.PlaceOrderOutput = (*PlaceOrder)(nil)

// NewPlaceOrder builds the presenter of ONE request: the locale is the request's.
func NewPlaceOrder(t Translate, locale string) *PlaceOrder { return &PlaceOrder{t: t, locale: locale} }

func (p *PlaceOrder) Present(r output.PlaceOrderResult) {
	key := "STATUS." + r.Status
	label := p.t(p.locale, key, nil)
	if label == key {
		label = r.Status // an unknown status stays readable
	}
	// Dollars whatever the language: the currency is a fact of the order, not of the reader.
	p.ViewModel = &ViewModel{OrderID: r.OrderID, StatusLabel: label, Total: fmt.Sprintf("$%d.%02d", r.TotalCents/100, r.TotalCents%100)}
}

func (p *PlaceOrder) PresentError(err error) {
	var notFound *interactors.CustomerNotFoundError
	var invalid *domain.InvalidOrderError
	// By type and reason, never by message text.
	switch {
	case errors.As(err, &notFound):
		p.fail(CustomerNotFound, p.t(p.locale, "CUSTOMER_NOT_FOUND", map[string]string{"customerId": notFound.CustomerID}))
	case errors.As(err, &invalid):
		p.fail(InvalidOrder, p.t(p.locale, "INVALID_ORDER."+string(invalid.Reason), nil))
	default: // never leak the message of an unexpected failure
		p.fail(UnknownError, p.t(p.locale, "UNKNOWN_ERROR", nil))
	}
}

func (p *PlaceOrder) fail(code ErrorCode, message string) {
	p.ErrorViewModel = &ErrorViewModel{Code: code, Message: message}
}
```

## The view — the humble half, in platform/web

```go
// internal/platform/web/place_order_route.go
// Thin: reads what the presenter prepared and sends it. bootstrap builds a NEW presenter per request, in the
// request's locale (negotiated from Accept-Language here in platform/web).
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
func PlaceOrderHandler(make func(locale string) (*orderspresenters.PlaceOrder, func(*http.Request)), locales []string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		presenter, handle := make(NegotiateLocale(r.Header.Get("Accept-Language"), locales))
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
	"strings"
	"testing"

	"example.com/shop/internal/modules/orders/application/interactors"
	"example.com/shop/internal/modules/orders/application/ports/output"
)

// translate reads the module's own catalog, falling back to the key: a test of this package may not import
// platform/i18n (infrastructure never depends on platform).
func translate(locale, key string, params map[string]string) string {
	text, ok := Messages[locale][key]
	if !ok {
		return key
	}
	for name, value := range params {
		text = strings.ReplaceAll(text, "{"+name+"}", value)
	}
	return text
}

func TestPresentFormatsTheResultInTheRequestLanguage(t *testing.T) {
	p := NewPlaceOrder(translate, "es")
	p.Present(output.PlaceOrderResult{OrderID: "o-1", Status: "PENDING", TotalCents: 2550})
	if p.ViewModel.StatusLabel != "Pendiente" || p.ViewModel.Total != "$25.50" {
		t.Fatalf("got %+v", p.ViewModel)
	}
}

func TestPresentErrorMapsTypedErrorsAndHidesTheRest(t *testing.T) {
	p := NewPlaceOrder(translate, "en")
	p.PresentError(&interactors.CustomerNotFoundError{CustomerID: "c-9"})
	if *p.ErrorViewModel != (ErrorViewModel{Code: CustomerNotFound, Message: "Customer c-9 not found"}) {
		t.Fatalf("got %+v", p.ErrorViewModel)
	}
	p.PresentError(errors.New("pq: relation \"orders\" does not exist"))
	if p.ErrorViewModel.Message != "Unexpected error" {
		t.Fatalf("leaked %q", p.ErrorViewModel.Message)
	}
}
```
