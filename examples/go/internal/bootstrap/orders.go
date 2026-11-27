package bootstrap

import (
	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
	ordersinteractors "example.com/shop/internal/modules/orders/application/interactors"
	ordersoutput "example.com/shop/internal/modules/orders/application/ports/output"
	orderscontrollers "example.com/shop/internal/modules/orders/infrastructure/controllers"
	ordersgateways "example.com/shop/internal/modules/orders/infrastructure/gateways"
	orderspresenters "example.com/shop/internal/modules/orders/infrastructure/presenters"
	"example.com/shop/internal/platform/db"
	"example.com/shop/internal/platform/i18n"
	"example.com/shop/internal/platform/web"
)

var ordersMigrations = db.Migration{Module: "orders", Files: ordersgateways.Migrations}

// composeOrders returns the PlaceOrder factory. getCustomer is customers' INPUT port: the only legal
// cross-module link. Presenters are stateful, so every request gets a NEW presenter, interactor and controller,
// in the request's locale.
func composeOrders(orders ordersoutput.OrderRepository, events ordersoutput.OrderEvents, newID func() string,
	getCustomer customersinput.GetCustomer, defaultLocale string) func(locale string) web.PlaceOrderPair {
	customers := ordersgateways.NewCustomerLookupGateway(getCustomer)
	t := i18n.New(orderspresenters.Messages, defaultLocale)
	return func(locale string) web.PlaceOrderPair {
		presenter := orderspresenters.NewPlaceOrder(t, locale)
		interactor := ordersinteractors.NewPlaceOrder(presenter, orders, customers, newID, events)
		return web.PlaceOrderPair{Presenter: presenter, Controller: orderscontrollers.NewPlaceOrder(interactor)}
	}
}
