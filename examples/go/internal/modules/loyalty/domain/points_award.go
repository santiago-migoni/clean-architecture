package domain

import "strings"

// PointsAward is the points a customer earned for one order. The order and the customer belong to other modules:
// they are referenced by id only, and loyalty keeps its own copy of the one number it needs (the total).
type PointsAward struct {
	orderID    string
	customerID string
	points     int
}

// NewPointsAwardForOrder applies the Critical Business Rule: one point per whole dollar spent.
func NewPointsAwardForOrder(orderID, customerID string, totalCents int) (*PointsAward, error) {
	if totalCents < 0 {
		return nil, &InvalidPointsAwardError{Reason: ReasonInvalidTotal, Detail: "an order total must not be negative"}
	}
	return ReconstitutePointsAward(orderID, customerID, totalCents/100)
}

// ReconstitutePointsAward rebuilds an award from persistence: the same invariants.
func ReconstitutePointsAward(orderID, customerID string, points int) (*PointsAward, error) {
	switch {
	case strings.TrimSpace(orderID) == "":
		return nil, &InvalidPointsAwardError{Reason: ReasonOrderRequired, Detail: "an award must reference an order"}
	case strings.TrimSpace(customerID) == "":
		return nil, &InvalidPointsAwardError{Reason: ReasonCustomerRequired, Detail: "an award must reference a customer"}
	case points < 0:
		return nil, &InvalidPointsAwardError{Reason: ReasonInvalidTotal, Detail: "points must not be negative"}
	}
	return &PointsAward{orderID: orderID, customerID: customerID, points: points}, nil
}

func (a *PointsAward) OrderID() string    { return a.orderID }
func (a *PointsAward) CustomerID() string { return a.customerID }
func (a *PointsAward) Points() int        { return a.points }
