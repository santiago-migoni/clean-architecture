// Package output declares the ports the orders use cases need, one file per port.
// CustomerLookup is owned by orders and implemented in orders/infrastructure by calling the
// customers INPUT port.
package output

type CustomerLookup interface {
	Exists(customerID string) (bool, error)
}
