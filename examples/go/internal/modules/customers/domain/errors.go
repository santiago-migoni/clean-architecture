package domain

import (
	"fmt"

	"example.com/shop/internal/shared"
)

// ErrInvalidCustomer: a rule of the Customer entity was violated.
var ErrInvalidCustomer = fmt.Errorf("invalid customer: %w", shared.ErrBusinessRule)

// InvalidCustomerReason is the stable code of the rule that was violated: the outer layers translate it for users.
type InvalidCustomerReason string

const (
	ReasonNameRequired InvalidCustomerReason = "NAME_REQUIRED"
	ReasonInvalidEmail InvalidCustomerReason = "INVALID_EMAIL"
)

// InvalidCustomerError carries the reason; its message is for logs, in English. errors.Is(err, ErrInvalidCustomer) holds.
type InvalidCustomerError struct {
	Reason InvalidCustomerReason
	Detail string
}

func (e *InvalidCustomerError) Error() string { return ErrInvalidCustomer.Error() + ": " + e.Detail }
func (e *InvalidCustomerError) Unwrap() error { return ErrInvalidCustomer }
