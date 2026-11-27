// Package bootstrap is the composition root: the only place that wires modules and layers.
package bootstrap

import (
	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/domain"
	customersmem "example.com/shop/internal/modules/customers/infrastructure/gateways/inmemory"
	orderinteractors "example.com/shop/internal/modules/orders/application/interactors"
	ordergateways "example.com/shop/internal/modules/orders/infrastructure/gateways"
	ordersmem "example.com/shop/internal/modules/orders/infrastructure/gateways/inmemory"
	"example.com/shop/internal/platform/clock"
)

type App struct {
	PlaceOrder *orderinteractors.PlaceOrder
}

func New() App {
	customers := customersmem.NewCustomerRepository(domain.Customer{ID: "c-1", Name: "Ada"})
	getCustomer := interactors.NewGetCustomer(customers)
	lookup := ordergateways.NewCustomerLookupGateway(getCustomer)
	orders := ordersmem.NewOrderRepository()
	return App{PlaceOrder: orderinteractors.NewPlaceOrder(orders, lookup, clock.System{})}
}
