package domain

import (
	"fmt"

	"example.com/shop/internal/shared"
)

// ErrInvalidCustomer: a rule of the Customer entity was violated.
var ErrInvalidCustomer = fmt.Errorf("invalid customer: %w", shared.ErrBusinessRule)
