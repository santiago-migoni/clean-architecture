package bootstrap

import (
	"context"
	"fmt"
	"net/http"

	customersinmemory "example.com/shop/internal/modules/customers/infrastructure/gateways/inmemory"
	loyaltyinmemory "example.com/shop/internal/modules/loyalty/infrastructure/gateways/inmemory"
	ordersgateways "example.com/shop/internal/modules/orders/infrastructure/gateways"
	ordersinmemory "example.com/shop/internal/modules/orders/infrastructure/gateways/inmemory"
	"example.com/shop/internal/platform/events"
	"example.com/shop/internal/platform/web"
)

// TestApp is the TEST composition root: the same use cases, controllers, presenters and subscriptions on in-memory
// implementations of the same ports, with deterministic ids.
type TestApp struct {
	Handler   http.Handler
	Orders    *ordersinmemory.OrderRepository
	Published *[]events.Event // every integration event, in order
}

func NewForTest() TestApp {
	n := 0
	deterministicID := func() string { n++; return fmt.Sprintf("id-%d", n) }
	// The same bus and subscriptions as production. In tests a failing subscriber must be seen, so it panics.
	bus := events.NewBus(func(err error, e events.Event) { panic(fmt.Sprintf("subscriber failed on %s: %v", e.EventType(), err)) })
	published := &[]events.Event{}
	bus.SubscribeAll(func(_ context.Context, e events.Event) error { *published = append(*published, e); return nil })

	orders := ordersinmemory.NewOrderRepository()
	customers := composeCustomers(customersinmemory.NewCustomerRepository(), deterministicID, Locales[0])
	orderEvents := ordersgateways.NewPublishedOrderEvents(publishOrderPlaced(bus))
	makePlaceOrder := composeOrders(orders, orderEvents, deterministicID, customers.GetCustomer, Locales[0])
	getPoints := composeLoyalty(loyaltyinmemory.NewAwardRepository(), bus)
	handlers := web.Handlers{RegisterCustomer: customers.RegisterCustomer, GetCustomer: customers.GetController, MakePlaceOrder: makePlaceOrder, GetPoints: getPoints}
	return TestApp{Handler: web.NewHandler(handlers, Locales), Orders: orders, Published: published}
}
