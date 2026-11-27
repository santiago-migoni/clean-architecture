// Package published holds the orders module's PUBLISHED CONTRACTS (integration events): what orders announces to
// other modules. Part of the module's public surface, like application/ports/input. Plain, versioned data: it
// imports nothing, so a subscriber depends on this package only, never on orders' domain. A change that breaks a
// subscriber is a new version (v2), published beside v1.
package published

const OrderPlacedV1Type = "orders.order-placed.v1"

type OrderPlacedV1 struct {
	OrderID    string `json:"orderId"`
	CustomerID string `json:"customerId"`
	TotalCents int    `json:"totalCents"`
}

// EventType names the event on the bus.
func (OrderPlacedV1) EventType() string { return OrderPlacedV1Type }
