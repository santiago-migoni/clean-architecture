package gateways

import (
	"context"

	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
	"example.com/shop/internal/modules/orders/application/ports/output"
)

// CustomerLookupGateway is the only kind of cross-module import allowed: infrastructure → another module's
// application/ports/input.
type CustomerLookupGateway struct{ getCustomer customersinput.GetCustomer }

var _ output.CustomerLookup = (*CustomerLookupGateway)(nil)

func NewCustomerLookupGateway(getCustomer customersinput.GetCustomer) *CustomerLookupGateway {
	return &CustomerLookupGateway{getCustomer: getCustomer}
}

func (g *CustomerLookupGateway) Exists(ctx context.Context, customerID string) (bool, error) {
	view, err := g.getCustomer.Execute(ctx, customerID)
	return view != nil, err // orders only needs a boolean
}
