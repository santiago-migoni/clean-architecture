// Package domain holds the orders module's enterprise business rules.
// It refers to customers by id only, never by importing their domain.
package domain

import (
	"errors"

	"example.com/shop/internal/shared"
)

var ErrInvalidQuantity = errors.New("quantity must be positive")

type Order struct {
	ID         shared.ID
	CustomerID string
	Quantity   int
}

func NewOrder(id shared.ID, customerID string, quantity int) (Order, error) {
	if quantity <= 0 {
		return Order{}, ErrInvalidQuantity
	}
	return Order{ID: id, CustomerID: customerID, Quantity: quantity}, nil
}
