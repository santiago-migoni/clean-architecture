// Package interactors implements the orders use cases.
package interactors

import (
	"errors"

	"example.com/shop/internal/modules/orders/application/ports/output"
	orderdomain "example.com/shop/internal/modules/orders/domain"
	"example.com/shop/internal/shared"
)

var ErrCustomerNotFound = errors.New("customer not found")

type PlaceOrder struct {
	orders    output.OrderRepository
	customers output.CustomerLookup
	clock     output.Clock
}

func NewPlaceOrder(orders output.OrderRepository, customers output.CustomerLookup, clock output.Clock) *PlaceOrder {
	return &PlaceOrder{orders: orders, customers: customers, clock: clock}
}

func (uc *PlaceOrder) Execute(customerID string, quantity int) (shared.ID, error) {
	ok, err := uc.customers.Exists(customerID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", ErrCustomerNotFound
	}
	order, err := orderdomain.NewOrder(shared.NewID("o", uc.orders.Count()+1), customerID, quantity)
	if err != nil {
		return "", err
	}
	_ = uc.clock.Now()
	return order.ID, uc.orders.Save(order)
}
