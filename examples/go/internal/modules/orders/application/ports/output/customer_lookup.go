package output

import "context"

// CustomerLookup is owned by orders, in orders' vocabulary. A gateway implements it by calling the customers
// module's INPUT port — never by importing customers' domain or infrastructure.
type CustomerLookup interface {
	Exists(ctx context.Context, customerID string) (bool, error)
}
