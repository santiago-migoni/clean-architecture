// Package bootstrap is the composition root: the only place that wires modules and layers.
// Every module has packages with the same names, so each import is aliased <module><package>.
package bootstrap

import (
	customersinteractors "example.com/shop/internal/modules/customers/application/interactors"
	customersdomain "example.com/shop/internal/modules/customers/domain"
	customersinmemory "example.com/shop/internal/modules/customers/infrastructure/gateways/inmemory"
	ordersinteractors "example.com/shop/internal/modules/orders/application/interactors"
	ordersgateways "example.com/shop/internal/modules/orders/infrastructure/gateways"
	ordersinmemory "example.com/shop/internal/modules/orders/infrastructure/gateways/inmemory"
	"example.com/shop/internal/platform/clock"
)

type App struct {
	PlaceOrder *ordersinteractors.PlaceOrder
}

func New() App {
	customers := customersinmemory.NewCustomerRepository(customersdomain.Customer{ID: "c-1", Name: "Ada"})
	getCustomer := customersinteractors.NewGetCustomer(customers)
	lookup := ordersgateways.NewCustomerLookupGateway(getCustomer)
	orders := ordersinmemory.NewOrderRepository()
	return App{PlaceOrder: ordersinteractors.NewPlaceOrder(orders, lookup, clock.System{})}
}
