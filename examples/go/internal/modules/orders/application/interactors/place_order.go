// Package interactors implements the orders use cases.
package interactors

import (
	"context"
	"errors"

	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/domain"
	"example.com/shop/internal/modules/orders/domain/events"
)

type PlaceOrderLine struct {
	ProductID      string
	Quantity       int
	UnitPriceCents int
}

type PlaceOrderRequest struct {
	CustomerID string
	Lines      []PlaceOrderLine
}

// PlaceOrder HAS an Output Port (a presenter formats the answer): Execute returns only unexpected errors.
type PlaceOrder struct {
	out       output.PlaceOrderOutput
	orders    output.OrderRepository
	customers output.CustomerLookup
	newID     func() string
	events    output.OrderEvents
}

func NewPlaceOrder(out output.PlaceOrderOutput, orders output.OrderRepository, customers output.CustomerLookup,
	newID func() string, events output.OrderEvents) *PlaceOrder {
	return &PlaceOrder{out: out, orders: orders, customers: customers, newID: newID, events: events}
}

func (uc *PlaceOrder) Execute(ctx context.Context, req PlaceOrderRequest) error {
	lines := make([]domain.Line, 0, len(req.Lines))
	for _, l := range req.Lines {
		lines = append(lines, domain.Line{ProductID: l.ProductID, Quantity: l.Quantity, UnitPriceCents: l.UnitPriceCents})
	}
	// Enterprise rules first: a malformed order is rejected before asking another module.
	order, err := domain.NewOrder(uc.newID(), req.CustomerID, lines)
	if errors.Is(err, domain.ErrInvalidOrder) {
		uc.out.PresentError(err)
		return nil
	}
	if err != nil {
		return err
	}
	exists, err := uc.customers.Exists(ctx, order.CustomerID())
	if err != nil {
		return err
	}
	if !exists {
		uc.out.PresentError(&CustomerNotFoundError{CustomerID: order.CustomerID()})
		return nil
	}
	if err := uc.orders.Save(ctx, order); err != nil {
		return err // a database failure is not presented: it is an unexpected error
	}
	if err := uc.events.Publish(ctx, events.NewOrderPlaced(order)); err != nil { // only after the order is stored
		return err
	}
	uc.out.Present(output.PlaceOrderResult{OrderID: order.ID(), Status: string(order.Status()), TotalCents: order.TotalCents()})
	return nil
}
