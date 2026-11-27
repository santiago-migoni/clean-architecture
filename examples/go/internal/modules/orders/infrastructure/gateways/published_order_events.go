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
