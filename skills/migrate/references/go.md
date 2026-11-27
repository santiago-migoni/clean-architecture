# Migration steps — Go

Each phase keeps the application working: the old code first **delegates** to the new piece, and is deleted only when nothing calls it any more (strangler fig). Old code: a flat `internal/service` and `internal/store`; new code: `internal/modules/orders/`.

## Phase 1 — extract the business rule into an entity

```go
// BEFORE — internal/service/orders.go: the rule lives in a service, on a storage struct
func (s *OrderService) CanCancel(o store.OrderRow) bool {
	return o.Status == "PENDING" && len(o.Items) > 0
}
```

```go
// AFTER — the rule moves to the entity; the service keeps its signature and delegates
package service

import (
	ordersdomain "example.com/shop/internal/modules/orders/domain"
	"example.com/shop/internal/store"
)

type OrderService struct{}

func (s *OrderService) CanCancel(row store.OrderRow) (bool, error) {
	lines := make([]ordersdomain.Line, 0, len(row.Items))
	for _, i := range row.Items {
		lines = append(lines, ordersdomain.Line{ProductID: i.SKU, Quantity: i.Qty, UnitPriceCents: i.PriceCents})
	}
	order, err := ordersdomain.Reconstitute(row.ID, row.CustomerID, lines, ordersdomain.Status(row.Status))
	if err != nil {
		return false, err
	}
	return order.CanBeCancelled(), nil
}
```

## Phase 2 — declare the ports where they are used

```go
// internal/modules/orders/application/ports/output/order_repository.go
package output

import (
	"context"

	"example.com/shop/internal/modules/orders/domain"
)

type OrderRepository interface {
	FindByID(ctx context.Context, id string) (*domain.Order, error)
	Save(ctx context.Context, order *domain.Order) error
}
```

The existing store satisfies it implicitly once it returns entities; add `var _ output.OrderRepository = (*Store)(nil)` to let the compiler confirm it.

## Phase 3 — move the use case into an interactor, the service delegates

```go
// internal/service/orders.go — now a thin facade kept for existing callers
package service

import (
	"context"

	ordersinteractors "example.com/shop/internal/modules/orders/application/interactors"
)

type OrderFacade struct{ placeOrder *ordersinteractors.PlaceOrder }

func (f *OrderFacade) Place(ctx context.Context, req ordersinteractors.PlaceOrderRequest) (ordersinteractors.PlaceOrderResponse, error) {
	return f.placeOrder.Execute(ctx, req) // delete the facade when callers use the interactor
}
```

## Phase 4 — move the SQL into a gateway

The queries of the old store move to `internal/modules/orders/infrastructure/gateways/` (or a technology-named package such as `postgres`), with the row structs and the mapping beside them; see the `gateway` skill's Go reference. Each module takes only its own tables.

## Phase 7 — enforcement

The compiler already forbids import cycles and `internal/` keeps other repositories out, but neither stops one module from importing another. Run `ca-scan` in CI, and optionally go-arch-lint (both in the `init` skill's Go reference): it reads imports through the `go.mod` module path and checks both axes and SQL table ownership.
