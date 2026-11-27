# SOLID fixes — Go

Before/after for the three principles whose fixes are structural. SRP and LSP are judgments (the actor test, the substitution test), shown in the skill itself. Go helps with ISP and DIP by design: interfaces are small, declared by the consumer, and satisfied implicitly.

## OCP — a strategy per variant instead of a type switch

```go
// Violation: every new payment method edits this function.
func ProcessPayment(kind string, amountCents int64) (string, error) {
	switch kind {
	case "credit":
		return fmt.Sprintf("card:%d", amountCents), nil
	case "paypal":
		return fmt.Sprintf("paypal:%d", amountCents), nil
	}
	return "", fmt.Errorf("unknown payment type %s", kind)
}
```

```go
// Fix: open for extension. Strategies are registered in bootstrap and selected by key.
package interactors

import (
	"context"
	"fmt"
)

type PaymentStrategy interface {
	Process(ctx context.Context, amountCents int64) (string, error)
}

type UnsupportedPaymentMethodError struct{ Method string }

func (e *UnsupportedPaymentMethodError) Error() string {
	return fmt.Sprintf("unsupported payment method %s", e.Method)
}

type ProcessPayment struct{ strategies map[string]PaymentStrategy }

func NewProcessPayment(strategies map[string]PaymentStrategy) *ProcessPayment {
	return &ProcessPayment{strategies: strategies}
}

func (uc *ProcessPayment) Execute(ctx context.Context, method string, amountCents int64) (string, error) {
	strategy, ok := uc.strategies[method]
	if !ok {
		return "", &UnsupportedPaymentMethodError{Method: method}
	}
	return strategy.Process(ctx, amountCents)
}
```

## ISP — small interfaces, declared by the consumer

```go
// Violation: one interface for every use case, with methods most of them never call.
type CustomerRepository interface {
	FindByID(ctx context.Context, id string) (*Customer, error)
	Save(ctx context.Context, c *Customer) error
	Delete(ctx context.Context, id string) error
	MonthlySignupReport(ctx context.Context) (string, error)
}

// Fix: each use case declares only what it uses; the same gateway satisfies all of them.
type CustomerReader interface {
	FindByID(ctx context.Context, id string) (*Customer, error)
}

type CustomerWriter interface {
	Save(ctx context.Context, c *Customer) error
}
```

## DIP — accept interfaces, construct the detail in bootstrap

```go
// Violation: the use case constructs its database gateway (application → infrastructure).
func (uc *PlaceOrderBefore) Execute(ctx context.Context, o *Order) error {
	repo := postgres.NewOrderRepository(uc.dsn)
	return repo.Save(ctx, o)
}

// Fix: the use case depends on its own port; bootstrap passes the implementation in.
type OrderRepository interface {
	Save(ctx context.Context, o *Order) error
}

type PlaceOrder struct{ orders OrderRepository }

func NewPlaceOrder(orders OrderRepository) *PlaceOrder { return &PlaceOrder{orders: orders} }

func (uc *PlaceOrder) Execute(ctx context.Context, o *Order) error {
	return uc.orders.Save(ctx, o)
}
```
