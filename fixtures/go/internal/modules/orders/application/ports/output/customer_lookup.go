// Package output declares the ports the orders use cases need. CustomerLookup is owned
// by orders and implemented in orders/infrastructure by calling the customers INPUT port.
package output

import (
	"time"

	"example.com/shop/internal/modules/orders/domain"
)

type CustomerLookup interface {
	Exists(customerID string) (bool, error)
}

type OrderRepository interface {
	Save(order domain.Order) error
	Count() int
}

type Clock interface {
	Now() time.Time
}
