// Package presenters holds the TESTABLE half of the Humble Object split: all formatting logic lives here.
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
	p.ViewModel = &ViewModel{OrderID: r.OrderID, StatusLabel: label, Total: dollars(r.TotalCents)}
}

func (p *PlaceOrder) PresentError(err error) {
	var notFound *interactors.CustomerNotFoundError
	switch {
	case errors.As(err, &notFound):
		p.ErrorViewModel = &ErrorViewModel{Code: CustomerNotFound, Message: err.Error()}
	case errors.Is(err, domain.ErrInvalidOrder):
		p.ErrorViewModel = &ErrorViewModel{Code: InvalidOrder, Message: ruleMessage(err)}
	default: // never leak the message of an unexpected failure
		p.ErrorViewModel = &ErrorViewModel{Code: UnknownError, Message: "Unexpected error"}
	}
}

func (p *PlaceOrder) HasError() bool { return p.ErrorViewModel != nil }

// dollars formats cents as "$1,234.56".
func dollars(cents int) string {
	whole, frac := cents/100, cents%100
	digits := fmt.Sprint(whole)
	for i := len(digits) - 3; i > 0; i -= 3 {
		digits = digits[:i] + "," + digits[i:]
	}
	return fmt.Sprintf("$%s.%02d", digits, frac)
}

// ruleMessage drops the "invalid order: business rule violated: " prefix of a domain error.
func ruleMessage(err error) string {
	prefix := domain.ErrInvalidOrder.Error() + ": "
	if s := err.Error(); len(s) > len(prefix) && s[:len(prefix)] == prefix {
		return s[len(prefix):]
	}
	return err.Error()
}
