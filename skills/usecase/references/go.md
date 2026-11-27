# Use case — Go

Packages, inside `internal/modules/<module>/application/`: `interactors` (one file per use case, plus the module's application errors), `ports/output` (one file per port), `ports/input` (optional). Ports are interfaces in the package of the code that USES them; implementations satisfy them implicitly. Every method that may do I/O takes a `context.Context` first.

## Interactor — default flow (returns a response model)

```go
// internal/modules/orders/application/interactors/place_order.go
package interactors

import (
	"context"

	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/domain"
)

type PlaceOrderLine struct {
	ProductID      string
	Quantity       int
	UnitPriceCents int
}

type PlaceOrderRequest struct {
	CustomerID string
	Lines      []PlaceOrderLine
}

type PlaceOrderResponse struct {
	OrderID    string
	Status     string
	TotalCents int
}

type PlaceOrder struct {
	orders    output.OrderRepository
	customers output.CustomerLookup
	newID     func() string // injected: randomness does not belong in business rules
}

func NewPlaceOrder(orders output.OrderRepository, customers output.CustomerLookup, newID func() string) *PlaceOrder {
	return &PlaceOrder{orders: orders, customers: customers, newID: newID}
}

func (uc *PlaceOrder) Execute(ctx context.Context, req PlaceOrderRequest) (PlaceOrderResponse, error) {
	lines := make([]domain.Line, 0, len(req.Lines))
	for _, l := range req.Lines {
		lines = append(lines, domain.Line{ProductID: l.ProductID, Quantity: l.Quantity, UnitPriceCents: l.UnitPriceCents})
	}
	// Enterprise rules first: a malformed order fails before asking another module.
	order, err := domain.NewOrder(uc.newID(), req.CustomerID, lines)
	if err != nil {
		return PlaceOrderResponse{}, err
	}
	exists, err := uc.customers.Exists(ctx, order.CustomerID())
	if err != nil {
		return PlaceOrderResponse{}, err
	}
	if !exists {
		return PlaceOrderResponse{}, &CustomerNotFoundError{CustomerID: order.CustomerID()}
	}
	if err := uc.orders.Save(ctx, order); err != nil {
		return PlaceOrderResponse{}, err
	}
	return PlaceOrderResponse{OrderID: order.ID(), Status: string(order.Status()), TotalCents: order.TotalCents()}, nil
}
```

## Ports (output) — one file each

```go
// internal/modules/orders/application/ports/output/order_repository.go
package output

import (
	"context"

	"example.com/shop/internal/modules/orders/domain"
)

type OrderRepository interface {
	FindByID(ctx context.Context, id string) (*domain.Order, error) // nil, nil when absent
	Save(ctx context.Context, order *domain.Order) error
}
```

```go
// internal/modules/orders/application/ports/output/customer_lookup.go
// CustomerLookup is owned by orders, in orders' vocabulary; a gateway implements it by
// calling the customers INPUT port.
package output

import "context"

type CustomerLookup interface {
	Exists(ctx context.Context, customerID string) (bool, error)
}
```

## Application error

A type when the caller needs data from it (match with `errors.As`), a sentinel otherwise (`errors.Is`).

```go
// internal/modules/orders/application/interactors/errors.go
package interactors

import "fmt"

type CustomerNotFoundError struct{ CustomerID string }

func (e *CustomerNotFoundError) Error() string {
	return fmt.Sprintf("customer %s not found", e.CustomerID)
}
```

## Input Port (optional) — the module's public surface

```go
// internal/modules/customers/application/ports/input/get_customer.go
// Package input is the only package of customers that another module's infrastructure may import.
package input

import "context"

type CustomerView struct {
	ID    string
	Name  string
	Email string
}

type GetCustomer interface {
	Execute(ctx context.Context, customerID string) (*CustomerView, error) // nil, nil when absent
}
```

The interactor proves it implements the port at compile time: `var _ input.GetCustomer = (*GetCustomer)(nil)`.

## Output Port (optional)

```go
// internal/modules/orders/application/ports/output/place_order_output.go
package output

type PlaceOrderResult struct {
	OrderID    string
	Status     string
	TotalCents int
}

type PlaceOrderOutput interface {
	Present(result PlaceOrderResult)
	PresentError(err error)
}
```

With it, `Execute` returns only unexpected errors: it calls `PresentError` for `domain.ErrInvalidOrder` and `*CustomerNotFoundError`, and `Present` on success.

## Test — no database, the other module faked through this module's port

```go
// internal/modules/orders/application/interactors/place_order_test.go
package interactors

import (
	"context"
	"errors"
	"testing"

	ordersinmemory "example.com/shop/internal/modules/orders/infrastructure/gateways/inmemory"
)

type stubCustomers map[string]bool

func (s stubCustomers) Exists(_ context.Context, id string) (bool, error) { return s[id], nil }

var request = PlaceOrderRequest{CustomerID: "c-1", Lines: []PlaceOrderLine{{ProductID: "p-1", Quantity: 2, UnitPriceCents: 1000}}}

func TestPlaceOrderForAnExistingCustomer(t *testing.T) {
	uc := NewPlaceOrder(ordersinmemory.NewOrderRepository(), stubCustomers{"c-1": true}, func() string { return "o-1" })
	res, err := uc.Execute(context.Background(), request)
	if err != nil || res.OrderID != "o-1" || res.TotalCents != 2000 {
		t.Fatalf("got %+v, %v", res, err)
	}
}

func TestPlaceOrderForAnUnknownCustomer(t *testing.T) {
	orders := ordersinmemory.NewOrderRepository()
	_, err := NewPlaceOrder(orders, stubCustomers{}, func() string { return "o-1" }).Execute(context.Background(), request)
	var notFound *CustomerNotFoundError
	if !errors.As(err, &notFound) {
		t.Fatalf("want CustomerNotFoundError, got %v", err)
	}
}
```
