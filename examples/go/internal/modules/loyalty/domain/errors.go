// Package domain holds the loyalty module's enterprise business rules. It imports only internal/shared.
package domain

import (
	"fmt"

	"example.com/shop/internal/shared"
)

// ErrInvalidPointsAward: a rule of the PointsAward entity was violated.
var ErrInvalidPointsAward = fmt.Errorf("invalid points award: %w", shared.ErrBusinessRule)

// InvalidPointsAwardReason is the stable code of the rule that was violated.
type InvalidPointsAwardReason string

const (
	ReasonOrderRequired    InvalidPointsAwardReason = "ORDER_REQUIRED"
	ReasonCustomerRequired InvalidPointsAwardReason = "CUSTOMER_REQUIRED"
	ReasonInvalidTotal     InvalidPointsAwardReason = "INVALID_TOTAL"
)

// InvalidPointsAwardError carries the reason; its message is for logs. errors.Is(err, ErrInvalidPointsAward) holds.
type InvalidPointsAwardError struct {
	Reason InvalidPointsAwardReason
	Detail string
}

func (e *InvalidPointsAwardError) Error() string {
	return ErrInvalidPointsAward.Error() + ": " + e.Detail
}
func (e *InvalidPointsAwardError) Unwrap() error { return ErrInvalidPointsAward }
