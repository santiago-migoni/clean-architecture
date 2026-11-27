package gateways

import (
	"context"
	"testing"

	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
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

func TestAuditLogWritesOneJSONLinePerEvent(t *testing.T) {
	var lines []string
	_ = NewAuditLogOrderEvents(func(l string) { lines = append(lines, l) }).
		Publish(context.Background(), events.OrderPlaced{Type: "OrderPlaced", OrderID: "o-1", CustomerID: "c-1", TotalCents: 2500})
	if len(lines) != 1 || lines[0] != `{"type":"OrderPlaced","orderId":"o-1","customerId":"c-1","totalCents":2500}` {
		t.Fatalf("got %q", lines)
	}
}
