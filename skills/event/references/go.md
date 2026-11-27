# Event — Go

The complete, tested version of this code is [`examples/go`](../../../examples/go): the same application in every language.

Files: the contract in `internal/modules/<a>/application/ports/published/` (package `published`), the publishing adapter in `internal/modules/<a>/infrastructure/gateways/`, the subscriber in `internal/modules/<b>/infrastructure/subscribers/`, the bus in `internal/platform/events/`. Here `orders` publishes `OrderPlaced` and `loyalty` awards points for it. A contract names itself with an `EventType()` method, which is what the bus routes by.

## The published contract (orders)

```go
// internal/modules/orders/application/ports/published/order_placed_v1.go
// Package published holds the orders module's PUBLISHED CONTRACTS (integration events): what orders announces to
// other modules. Part of the module's public surface, like application/ports/input. Plain, versioned data: it
// imports nothing, so a subscriber depends on this package only, never on orders' domain. A change that breaks a
// subscriber is a new version (v2), published beside v1.
package published

const OrderPlacedV1Type = "orders.order-placed.v1"

type OrderPlacedV1 struct {
	OrderID    string `json:"orderId"`
	CustomerID string `json:"customerId"`
	TotalCents int    `json:"totalCents"`
}

// EventType names the event on the bus.
func (OrderPlacedV1) EventType() string { return OrderPlacedV1Type }
```

## The publishing adapter (orders)

The use case publishes the domain event through its own port (`output.OrderEvents`); this adapter maps it to the contract.

```go
// internal/modules/orders/infrastructure/gateways/published_order_events.go
package gateways

import (
	"context"

	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/application/ports/published"
	"example.com/shop/internal/modules/orders/domain/events"
)

// PublishedOrderEvents implements OrderEvents by publishing each domain event as orders' integration event. It maps
// the domain event (orders' own vocabulary) to the published contract (what other modules may rely on). The bus is
// injected by bootstrap as a function: this package never imports platform.
type PublishedOrderEvents struct {
	send func(context.Context, published.OrderPlacedV1) error
}

var _ output.OrderEvents = (*PublishedOrderEvents)(nil)

func NewPublishedOrderEvents(send func(context.Context, published.OrderPlacedV1) error) *PublishedOrderEvents {
	return &PublishedOrderEvents{send: send}
}

func (p *PublishedOrderEvents) Publish(ctx context.Context, e events.OrderPlaced) error {
	return p.send(ctx, published.OrderPlacedV1{OrderID: e.OrderID, CustomerID: e.CustomerID, TotalCents: e.TotalCents})
}
```

## The subscriber (loyalty)

```go
// internal/modules/loyalty/infrastructure/subscribers/order_placed.go
// Package subscribers holds the loyalty module's driving adapters for events, like controllers for requests: each
// turns another module's integration event into loyalty's own request. Importing orders' PUBLISHED CONTRACT is the
// second legal crossing between modules (the first is a call to another module's ports/input); orders never knows
// that loyalty exists.
package subscribers

import (
	"context"

	"example.com/shop/internal/modules/loyalty/application/interactors"
	"example.com/shop/internal/modules/orders/application/ports/published"
)

type AwardPointsUseCase interface {
	Execute(ctx context.Context, req interactors.AwardPointsRequest) (interactors.AwardPointsResponse, error)
}

type OrderPlaced struct{ awardPoints AwardPointsUseCase }

func NewOrderPlaced(awardPoints AwardPointsUseCase) *OrderPlaced {
	return &OrderPlaced{awardPoints: awardPoints}
}

func (s *OrderPlaced) Handle(ctx context.Context, e published.OrderPlacedV1) error {
	_, err := s.awardPoints.Execute(ctx, interactors.AwardPointsRequest{OrderID: e.OrderID, CustomerID: e.CustomerID, TotalCents: e.TotalCents})
	return err
}
```

Loyalty's own use case, idempotent by order: the repository's `Add` returns `false` for an order already awarded (a primary key on `order_id` in SQL, `ON CONFLICT DO NOTHING`).

```go
// internal/modules/loyalty/application/interactors/award_points.go
// Package interactors holds the loyalty module's use cases.
package interactors

import (
	"context"

	"example.com/shop/internal/modules/loyalty/application/ports/output"
	"example.com/shop/internal/modules/loyalty/domain"
)

type AwardPointsRequest struct {
	OrderID    string
	CustomerID string
	TotalCents int
}

type AwardPointsResponse struct {
	Awarded bool // false when this order had already been awarded
	Points  int  // the points of this order
}

// AwardPoints awards the points of one placed order. It knows nothing of how it is called (an event, a command
// line, a backfill): the subscriber in infrastructure translates orders' event into this request.
type AwardPoints struct{ awards output.AwardRepository }

func NewAwardPoints(awards output.AwardRepository) *AwardPoints { return &AwardPoints{awards: awards} }

func (uc *AwardPoints) Execute(ctx context.Context, req AwardPointsRequest) (AwardPointsResponse, error) {
	award, err := domain.NewPointsAwardForOrder(req.OrderID, req.CustomerID, req.TotalCents)
	if err != nil {
		return AwardPointsResponse{}, err
	}
	awarded, err := uc.awards.Add(ctx, award) // idempotent: one award per order
	if err != nil {
		return AwardPointsResponse{}, err
	}
	return AwardPointsResponse{Awarded: awarded, Points: award.Points()}, nil
}
```

## The bus (platform/events)

```go
// internal/platform/events/bus.go
// Package events delivers integration events to the subscribers bootstrap registered, in the same process. A driver,
// like the database: replacing it with a broker (and an outbox) changes no module.
//
// Delivery is synchronous and in order, after the publisher stored its change. A subscriber that fails (an error or
// a panic) is reported and never fails the publisher: the order is placed whatever loyalty does. There is no retry:
// an event whose subscriber failed is lost for that subscriber (at most once). An outbox, written in the same
// transaction as the change and published afterwards, is what makes it at least once.
package events

import (
	"context"
	"fmt"
)

// Event is any integration event: a published contract names itself.
type Event interface{ EventType() string }

type Handler func(context.Context, Event) error

type Bus struct {
	byType  map[string][]Handler
	all     []Handler
	onError func(error, Event)
}

func NewBus(onError func(error, Event)) *Bus {
	return &Bus{byType: map[string][]Handler{}, onError: onError}
}

func (b *Bus) Subscribe(eventType string, h Handler) {
	b.byType[eventType] = append(b.byType[eventType], h)
}

// SubscribeAll receives every event, whatever its type: an audit log, a tracer.
func (b *Bus) SubscribeAll(h Handler) { b.all = append(b.all, h) }

// Publish never returns a subscriber's failure: it reports it and goes on with the next subscriber.
func (b *Bus) Publish(ctx context.Context, e Event) error {
	for _, h := range append(append([]Handler{}, b.byType[e.EventType()]...), b.all...) {
		if err := deliver(ctx, h, e); err != nil {
			b.onError(err, e)
		}
	}
	return nil
}

func deliver(ctx context.Context, h Handler, e Event) (err error) {
	defer func() {
		if v := recover(); v != nil {
			err = fmt.Errorf("subscriber panicked: %v", v)
		}
	}()
	return h(ctx, e)
}
```

## The wiring (bootstrap)

The bus routes `events.Event`; bootstrap adapts each subscriber to its contract type, and hands orders a function of orders' own contract.

```go
// internal/bootstrap/loyalty.go
package bootstrap

import (
	"context"

	loyaltyinteractors "example.com/shop/internal/modules/loyalty/application/interactors"
	loyaltyoutput "example.com/shop/internal/modules/loyalty/application/ports/output"
	loyaltycontrollers "example.com/shop/internal/modules/loyalty/infrastructure/controllers"
	loyaltygateways "example.com/shop/internal/modules/loyalty/infrastructure/gateways"
	loyaltysubscribers "example.com/shop/internal/modules/loyalty/infrastructure/subscribers"
	orderspublished "example.com/shop/internal/modules/orders/application/ports/published"
	"example.com/shop/internal/platform/db"
	"example.com/shop/internal/platform/events"
)

var loyaltyMigrations = db.Migration{Module: "loyalty", Files: loyaltygateways.Migrations}

// composeLoyalty needs nothing from another module: loyalty only REACTS to orders' published event. It subscribes
// its subscriber to the bus and returns its controller.
func composeLoyalty(awards loyaltyoutput.AwardRepository, bus *events.Bus) *loyaltycontrollers.GetPoints {
	orderPlaced := loyaltysubscribers.NewOrderPlaced(loyaltyinteractors.NewAwardPoints(awards))
	bus.Subscribe(orderspublished.OrderPlacedV1Type, func(ctx context.Context, e events.Event) error {
		return orderPlaced.Handle(ctx, e.(orderspublished.OrderPlacedV1))
	})
	return loyaltycontrollers.NewGetPoints(loyaltyinteractors.NewGetPoints(awards))
}

// publishOrderPlaced is what orders gets to announce its event: the bus, behind a function of orders' own contract.
func publishOrderPlaced(bus *events.Bus) func(context.Context, orderspublished.OrderPlacedV1) error {
	return func(ctx context.Context, e orderspublished.OrderPlacedV1) error { return bus.Publish(ctx, e) }
}
```

## Tests

```go
// internal/modules/loyalty/infrastructure/subscribers/order_placed_test.go
package subscribers

import (
	"context"
	"testing"

	"example.com/shop/internal/modules/loyalty/application/interactors"
	"example.com/shop/internal/modules/orders/application/ports/published"
)

type recording struct {
	requests []interactors.AwardPointsRequest
}

func (r *recording) Execute(_ context.Context, req interactors.AwardPointsRequest) (interactors.AwardPointsResponse, error) {
	r.requests = append(r.requests, req)
	return interactors.AwardPointsResponse{}, nil
}

func TestTranslatesOrdersEventIntoLoyaltysOwnRequest(t *testing.T) {
	useCase := &recording{}
	_ = NewOrderPlaced(useCase).Handle(context.Background(), published.OrderPlacedV1{OrderID: "o-1", CustomerID: "c-1", TotalCents: 1750})
	if len(useCase.requests) != 1 || useCase.requests[0] != (interactors.AwardPointsRequest{OrderID: "o-1", CustomerID: "c-1", TotalCents: 1750}) {
		t.Fatalf("got %+v", useCase.requests)
	}
}
```

```go
// internal/platform/events/bus_test.go
package events

import (
	"context"
	"errors"
	"slices"
	"testing"
)

type event string

func (e event) EventType() string { return string(e) }

const placed, other = event("orders.order-placed.v1"), event("customers.customer-registered.v1")

func TestDeliversToTheSubscribersOfItsTypeInOrderAndToEveryCatchAllSubscriber(t *testing.T) {
	bus := NewBus(func(error, Event) {})
	var seen []string
	record := func(s string) Handler {
		return func(_ context.Context, e Event) error { seen = append(seen, s+e.EventType()); return nil }
	}
	bus.Subscribe(placed.EventType(), record("first:"))
	bus.Subscribe(placed.EventType(), record("second:"))
	bus.SubscribeAll(record("all:"))
	_ = bus.Publish(context.Background(), placed)
	_ = bus.Publish(context.Background(), other)
	want := []string{"first:" + string(placed), "second:" + string(placed), "all:" + string(placed), "all:" + string(other)}
	if !slices.Equal(seen, want) {
		t.Fatalf("got %v", seen)
	}
}

func TestAFailingSubscriberIsReportedAndNeverStopsTheOthersNorFailsThePublisher(t *testing.T) {
	var reported []error
	bus := NewBus(func(err error, _ Event) { reported = append(reported, err) })
	boom := errors.New("loyalty is down")
	after := 0
	bus.Subscribe(placed.EventType(), func(context.Context, Event) error { return boom })
	bus.Subscribe(placed.EventType(), func(context.Context, Event) error { panic("a bug") })
	bus.Subscribe(placed.EventType(), func(context.Context, Event) error { after++; return nil })
	if err := bus.Publish(context.Background(), placed); err != nil || after != 1 || len(reported) != 2 || !errors.Is(reported[0], boom) {
		t.Fatalf("err %v, after %d, reported %v", err, after, reported)
	}
}
```
