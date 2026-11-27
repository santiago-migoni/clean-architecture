// Package gateways implements orders' own ports. This is the only kind of cross-module
// import allowed: infrastructure -> another module's application/ports/input.
package gateways

import (
	customers "example.com/shop/internal/modules/customers/application/ports/input"
	"example.com/shop/internal/modules/orders/application/ports/output"
)

type CustomerLookupGateway struct{ getCustomer customers.GetCustomer }

var _ output.CustomerLookup = (*CustomerLookupGateway)(nil)

func NewCustomerLookupGateway(getCustomer customers.GetCustomer) *CustomerLookupGateway {
	return &CustomerLookupGateway{getCustomer: getCustomer}
}

func (g *CustomerLookupGateway) Exists(customerID string) (bool, error) {
	view, err := g.getCustomer.Execute(customerID)
	return view != nil, err
}
