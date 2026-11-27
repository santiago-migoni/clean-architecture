package bootstrap

import (
	"fmt"
	"net/http"

	customersinmemory "example.com/shop/internal/modules/customers/infrastructure/gateways/inmemory"
	ordersinmemory "example.com/shop/internal/modules/orders/infrastructure/gateways/inmemory"
	"example.com/shop/internal/platform/web"
)

// TestApp is the TEST composition root: the same use cases, controllers and presenters on in-memory
// implementations of the same ports, with deterministic ids.
type TestApp struct {
	Handler http.Handler
	Orders  *ordersinmemory.OrderRepository
	Events  *ordersinmemory.RecordingOrderEvents
}

func NewForTest() TestApp {
	n := 0
	deterministicID := func() string { n++; return fmt.Sprintf("id-%d", n) }
	orders, events := ordersinmemory.NewOrderRepository(), &ordersinmemory.RecordingOrderEvents{}
	customers := composeCustomers(customersinmemory.NewCustomerRepository(), deterministicID, Locales[0])
	makePlaceOrder := composeOrders(orders, events, deterministicID, customers.GetCustomer, Locales[0])
	handler := web.NewHandler(web.Handlers{RegisterCustomer: customers.RegisterCustomer, GetCustomer: customers.GetController, MakePlaceOrder: makePlaceOrder}, Locales)
	return TestApp{Handler: handler, Orders: orders, Events: events}
}
