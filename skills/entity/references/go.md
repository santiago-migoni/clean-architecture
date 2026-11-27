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

import "fmt"

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
		return fmt.Errorf("%w: order %s cannot be cancelled", ErrInvalidOrder, o.id)
	}
	o.status = StatusCancelled
	return nil
}

func (o *Order) validate() error {
	if o.customerID == "" {
		return fmt.Errorf("%w: order must reference a customer", ErrInvalidOrder)
	}
	if len(o.lines) == 0 {
		return fmt.Errorf("%w: order must have at least one line", ErrInvalidOrder)
	}
	for _, l := range o.lines {
		if l.Quantity <= 0 {
			return fmt.Errorf("%w: line quantity must be positive", ErrInvalidOrder)
		}
		if l.UnitPriceCents < 0 {
			return fmt.Errorf("%w: unit price must not be negative", ErrInvalidOrder)
		}
	}
	return nil
}
```

## Domain error

A sentinel the outer layers match with `errors.Is`; the message gives the detail.

```go
// internal/modules/orders/domain/errors.go
package domain

import "errors"

// ErrInvalidOrder: a rule of the Order aggregate was violated.
var ErrInvalidOrder = errors.New("invalid order")
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
