package gateways

import (
	"context"
	"testing"

	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
	"example.com/shop/internal/modules/orders/application/ports/published"
	"example.com/shop/internal/modules/orders/domain/events"
)

// Only the customers module's INPUT port is faked — never its domain or infrastructure.
type fakeGetCustomer map[string]bool

func (f fakeGetCustomer) Execute(_ context.Context, id string) (*customersinput.CustomerView, error) {
	if f[id] {
		return &customersinput.CustomerView{ID: id}, nil
	}
	return nil, nil
}

func TestCustomerLookupTranslatesTheAnswerIntoABoolean(t *testing.T) {
	g := NewCustomerLookupGateway(fakeGetCustomer{"c-1": true})
	if ok, _ := g.Exists(context.Background(), "c-1"); !ok {
		t.Fatal("c-1 should exist")
	}
	if ok, _ := g.Exists(context.Background(), "ghost"); ok {
		t.Fatal("ghost should not exist")
	}
}

func TestPublishedOrderEventsMapsTheDomainEventToThePublishedContract(t *testing.T) {
	var sent []published.OrderPlacedV1
	send := func(_ context.Context, e published.OrderPlacedV1) error { sent = append(sent, e); return nil }
	_ = NewPublishedOrderEvents(send).Publish(context.Background(), events.OrderPlaced{Type: "OrderPlaced", OrderID: "o-1", CustomerID: "c-1", TotalCents: 2500})
	if len(sent) != 1 || sent[0] != (published.OrderPlacedV1{OrderID: "o-1", CustomerID: "c-1", TotalCents: 2500}) || sent[0].EventType() != "orders.order-placed.v1" {
		t.Fatalf("got %+v", sent)
	}
}
