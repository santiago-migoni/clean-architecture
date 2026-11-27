// Package events holds the orders module's domain events: plain, immutable data about something the
// business cares about. OrderPlaced exists because other modules react to placed orders (loyalty awards points; an
// audit log records them), and the use case must not know who. The infrastructure maps it to the published
// contract (application/ports/published).
package events

import "example.com/shop/internal/modules/orders/domain"

type OrderPlaced struct {
	Type       string `json:"type"`
	OrderID    string `json:"orderId"`
	CustomerID string `json:"customerId"`
	TotalCents int    `json:"totalCents"`
}

func NewOrderPlaced(o *domain.Order) OrderPlaced {
	return OrderPlaced{Type: "OrderPlaced", OrderID: o.ID(), CustomerID: o.CustomerID(), TotalCents: o.TotalCents()}
}
