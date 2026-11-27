package interactors

import (
	"context"
	"errors"
	"testing"

	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/domain"
	"example.com/shop/internal/modules/orders/domain/events"
)

// Local fakes: an application test never imports infrastructure, and never the customers module.
type fakeOutput struct {
	results []output.PlaceOrderResult
	errs    []error
}

func (f *fakeOutput) Present(r output.PlaceOrderResult) { f.results = append(f.results, r) }
func (f *fakeOutput) PresentError(err error)            { f.errs = append(f.errs, err) }

type fakeOrders struct {
	saved   []*domain.Order
	failure error
}

func (f *fakeOrders) FindByID(context.Context, string) (*domain.Order, error) { return nil, nil }
func (f *fakeOrders) Save(_ context.Context, o *domain.Order) error {
	if f.failure != nil {
		return f.failure
	}
	f.saved = append(f.saved, o)
	return nil
}

type fakeCustomers struct {
	exists bool
	asked  []string
}

func (f *fakeCustomers) Exists(_ context.Context, id string) (bool, error) {
	f.asked = append(f.asked, id)
	return f.exists, nil
}

type fakeEvents struct{ published []events.OrderPlaced }

func (f *fakeEvents) Publish(_ context.Context, e events.OrderPlaced) error {
	f.published = append(f.published, e)
	return nil
}

var lines = []PlaceOrderLine{{ProductID: "p1", Quantity: 2, UnitPriceCents: 1000}}

func setup(exists bool) (*PlaceOrder, *fakeOutput, *fakeOrders, *fakeCustomers, *fakeEvents) {
	out, orders, customers, evs := &fakeOutput{}, &fakeOrders{}, &fakeCustomers{exists: exists}, &fakeEvents{}
	return NewPlaceOrder(out, orders, customers, func() string { return "o-1" }, evs), out, orders, customers, evs
}

func TestPresentsTheResultAndPublishesOrderPlaced(t *testing.T) {
	uc, out, orders, _, evs := setup(true)
	if err := uc.Execute(context.Background(), PlaceOrderRequest{CustomerID: "c-1", Lines: lines}); err != nil {
		t.Fatal(err)
	}
	if len(out.results) != 1 || out.results[0] != (output.PlaceOrderResult{OrderID: "o-1", Status: "PENDING", TotalCents: 2000}) {
		t.Fatalf("got %+v", out.results)
	}
	if len(orders.saved) != 1 || len(evs.published) != 1 || evs.published[0] != (events.OrderPlaced{Type: "OrderPlaced", OrderID: "o-1", CustomerID: "c-1", TotalCents: 2000}) {
		t.Fatalf("saved %d, published %+v", len(orders.saved), evs.published)
	}
}

func TestAnUnknownCustomerIsPresentedAndNothingIsStoredOrPublished(t *testing.T) {
	uc, out, orders, _, evs := setup(false)
	_ = uc.Execute(context.Background(), PlaceOrderRequest{CustomerID: "ghost", Lines: lines})
	var notFound *CustomerNotFoundError
	if len(out.errs) != 1 || !errors.As(out.errs[0], &notFound) || len(orders.saved) != 0 || len(evs.published) != 0 {
		t.Fatalf("errs %v, saved %d, published %d", out.errs, len(orders.saved), len(evs.published))
	}
}

func TestAMalformedOrderIsRejectedBeforeAskingTheCustomersModule(t *testing.T) {
	uc, out, _, customers, _ := setup(true)
	_ = uc.Execute(context.Background(), PlaceOrderRequest{CustomerID: "", Lines: lines})
	if len(out.errs) != 1 || !errors.Is(out.errs[0], domain.ErrInvalidOrder) || len(customers.asked) != 0 {
		t.Fatalf("errs %v, asked %v", out.errs, customers.asked)
	}
}

func TestAnUnexpectedFailureIsReturnedNotPresented(t *testing.T) {
	uc, out, orders, _, _ := setup(true)
	orders.failure = errors.New("database is locked")
	if err := uc.Execute(context.Background(), PlaceOrderRequest{CustomerID: "c-1", Lines: lines}); err == nil {
		t.Fatal("want the error back")
	}
	if len(out.results)+len(out.errs) != 0 {
		t.Fatal("an unexpected failure must not be presented")
	}
}
