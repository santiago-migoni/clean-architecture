// Package presenters holds the TESTABLE half of the Humble Object split: all formatting logic lives here, including
// the language: the use case returns codes (a status, a failure reason) and the presenter writes them for the locale.
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

// NewPlaceOrder builds the presenter of ONE request: the locale is the request's.
func NewPlaceOrder(t Translate, locale string) *PlaceOrder { return &PlaceOrder{t: t, locale: locale} }

var _ output.PlaceOrderOutput = (*PlaceOrder)(nil)

func (p *PlaceOrder) Present(r output.PlaceOrderResult) {
	key := "STATUS." + r.Status
	label := p.t(p.locale, key, nil)
	if label == key {
		label = r.Status // an unknown status stays readable
	}
	p.ViewModel = &ViewModel{OrderID: r.OrderID, StatusLabel: label, Total: dollars(r.TotalCents)}
}

func (p *PlaceOrder) PresentError(err error) {
	var notFound *interactors.CustomerNotFoundError
	var invalid *domain.InvalidOrderError
	switch {
	case errors.As(err, &notFound):
		p.fail(CustomerNotFound, p.t(p.locale, "CUSTOMER_NOT_FOUND", map[string]string{"customerId": notFound.CustomerID}))
	case errors.As(err, &invalid):
		p.fail(InvalidOrder, p.t(p.locale, "INVALID_ORDER."+string(invalid.Reason), nil))
	default: // never leak the message of an unexpected failure
		p.fail(UnknownError, p.t(p.locale, "UNKNOWN_ERROR", nil))
	}
}

func (p *PlaceOrder) HasError() bool { return p.ErrorViewModel != nil }

func (p *PlaceOrder) fail(code ErrorCode, message string) {
	p.ErrorViewModel = &ErrorViewModel{Code: code, Message: message}
}

// dollars formats cents as "$1,234.56", whatever the language: the currency is a fact of the order, not of the reader.
func dollars(cents int) string {
	whole, frac := cents/100, cents%100
	digits := fmt.Sprint(whole)
	for i := len(digits) - 3; i > 0; i -= 3 {
		digits = digits[:i] + "," + digits[i:]
	}
	return fmt.Sprintf("$%s.%02d", digits, frac)
}
