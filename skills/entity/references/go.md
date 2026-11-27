# Entity — Go

The complete, tested version of this code is [`examples/go`](../../../examples/go): the same application in every language.

Files: `internal/modules/<module>/domain/<entity>.go`, snake_case (`order.go`, `order_line.go`), package `domain`. Domain errors are sentinel values or error types in the same package. Tests are `_test.go` beside the code.

## Entity

Unexported fields keep the state behind methods; the constructors enforce the invariants.

```go
// internal/modules/orders/domain/order.go
// Package domain holds the orders module's enterprise business rules.
// It imports only internal/shared; the customer is referenced by id only.
package domain

type Status string

const (
	StatusPending   Status = "PENDING"
	StatusCancelled Status = "CANCELLED"
)

type Line struct {
	ProductID      string
	Quantity       int
	UnitPriceCents int
}

type Order struct {
	id         string
	customerID string
	lines      []Line
	status     Status
}

// NewOrder creates a pending order and enforces its invariants.
func NewOrder(id, customerID string, lines []Line) (*Order, error) {
	return Reconstitute(id, customerID, lines, StatusPending)
}

// Reconstitute rebuilds an order from persistence: same invariants, no creation-time effects.
func Reconstitute(id, customerID string, lines []Line, status Status) (*Order, error) {
	o := &Order{id: id, customerID: customerID, lines: append([]Line(nil), lines...), status: status}
	if err := o.validate(); err != nil {
		return nil, err
	}
	return o, nil
}

func (o *Order) ID() string         { return o.id }
func (o *Order) CustomerID() string { return o.customerID }
func (o *Order) Status() Status     { return o.status }
func (o *Order) Lines() []Line      { return append([]Line(nil), o.lines...) }

func (o *Order) TotalCents() int {
	total := 0
	for _, l := range o.lines {
		total += l.Quantity * l.UnitPriceCents
	}
	return total
}

// CanBeCancelled is a Critical Business Rule.
func (o *Order) CanBeCancelled() bool { return o.status == StatusPending }

func (o *Order) Cancel() error {
	if !o.CanBeCancelled() {
		return &InvalidOrderError{Reason: ReasonNotCancellable, Detail: "order " + o.id + " cannot be cancelled"}
	}
	o.status = StatusCancelled
	return nil
}

func (o *Order) validate() error {
	if o.customerID == "" {
		return &InvalidOrderError{Reason: ReasonCustomerRequired, Detail: "order must reference a customer"}
	}
	if len(o.lines) == 0 {
		return &InvalidOrderError{Reason: ReasonNoLines, Detail: "order must have at least one line"}
	}
	for _, l := range o.lines {
		if l.Quantity <= 0 {
			return &InvalidOrderError{Reason: ReasonInvalidQuantity, Detail: "line quantity must be positive"}
		}
		if l.UnitPriceCents < 0 {
			return &InvalidOrderError{Reason: ReasonInvalidUnitPrice, Detail: "unit price must not be negative"}
		}
	}
	return nil
}
```

## Domain error

A sentinel the outer layers match with `errors.Is`, and a typed error that carries the **reason**: a stable code the
outer layers map to a status and translate for users (`errors.As`). The detail is for logs, in one language; it is
never shown as it is.

```go
// internal/modules/orders/domain/errors.go
package domain

import "errors"

// ErrInvalidOrder: a rule of the Order aggregate was violated.
var ErrInvalidOrder = errors.New("invalid order")

// InvalidOrderReason is the stable code of the rule that was violated.
type InvalidOrderReason string

const (
	ReasonCustomerRequired InvalidOrderReason = "CUSTOMER_REQUIRED"
	ReasonNoLines          InvalidOrderReason = "NO_LINES"
	ReasonInvalidQuantity  InvalidOrderReason = "INVALID_QUANTITY"
	ReasonInvalidUnitPrice InvalidOrderReason = "INVALID_UNIT_PRICE"
	ReasonNotCancellable   InvalidOrderReason = "NOT_CANCELLABLE"
)

// InvalidOrderError carries the reason; errors.Is(err, ErrInvalidOrder) holds.
type InvalidOrderError struct {
	Reason InvalidOrderReason
	Detail string
}

func (e *InvalidOrderError) Error() string { return ErrInvalidOrder.Error() + ": " + e.Detail }
func (e *InvalidOrderError) Unwrap() error { return ErrInvalidOrder }
```

## Value object

A small struct passed by value: Go compares it with `==`.

```go
// internal/shared/money.go
package shared

import "fmt"

type Money struct {
	Cents    int64
	Currency string
}

func (m Money) Add(other Money) (Money, error) {
	if other.Currency != m.Currency {
		return Money{}, fmt.Errorf("cannot add %s to %s", other.Currency, m.Currency)
	}
	return Money{Cents: m.Cents + other.Cents, Currency: m.Currency}, nil
}
```

## Test

```go
// internal/modules/orders/domain/order_test.go — no mocks: the entity is pure
package domain

import (
	"errors"
	"testing"
)

func TestNewOrderStartsPendingAndTotalsItsLines(t *testing.T) {
	o, err := NewOrder("o-1", "c-1", []Line{{ProductID: "p-1", Quantity: 2, UnitPriceCents: 1250}})
	if err != nil {
		t.Fatal(err)
	}
	if o.Status() != StatusPending || o.TotalCents() != 2500 || !o.CanBeCancelled() {
		t.Fatalf("got status %s, total %d", o.Status(), o.TotalCents())
	}
}

func TestNewOrderRejectsAnOrderWithoutLines(t *testing.T) {
	if _, err := NewOrder("o-1", "c-1", nil); !errors.Is(err, ErrInvalidOrder) {
		t.Fatalf("want ErrInvalidOrder, got %v", err)
	}
}
```
