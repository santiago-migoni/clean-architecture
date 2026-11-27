package domain

import (
	"fmt"

	"example.com/shop/internal/shared"
)

// ErrInvalidOrder: a rule of the Order aggregate was violated.
var ErrInvalidOrder = fmt.Errorf("invalid order: %w", shared.ErrBusinessRule)
