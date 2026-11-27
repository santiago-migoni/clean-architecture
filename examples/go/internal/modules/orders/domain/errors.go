package domain

import (
	"fmt"

	"example.com/shop/internal/shared"
)

// ErrInvalidOrder: a rule of the Order aggregate was violated.
var ErrInvalidOrder = fmt.Errorf("invalid order: %w", shared.ErrBusinessRule)

// InvalidOrderReason is the stable code of the rule that was violated: the outer layers translate it for users.
type InvalidOrderReason string

const (
	ReasonCustomerRequired InvalidOrderReason = "CUSTOMER_REQUIRED"
	ReasonNoLines          InvalidOrderReason = "NO_LINES"
	ReasonProductRequired  InvalidOrderReason = "PRODUCT_REQUIRED"
	ReasonInvalidQuantity  InvalidOrderReason = "INVALID_QUANTITY"
	ReasonInvalidUnitPrice InvalidOrderReason = "INVALID_UNIT_PRICE"
)

// InvalidOrderError carries the reason; its message is for logs, in English. errors.Is(err, ErrInvalidOrder) holds.
type InvalidOrderError struct {
	Reason InvalidOrderReason
	Detail string
}

func (e *InvalidOrderError) Error() string { return ErrInvalidOrder.Error() + ": " + e.Detail }
func (e *InvalidOrderError) Unwrap() error { return ErrInvalidOrder }
