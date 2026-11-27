package bootstrap

import (
	"context"

	loyaltyinteractors "example.com/shop/internal/modules/loyalty/application/interactors"
	loyaltyoutput "example.com/shop/internal/modules/loyalty/application/ports/output"
	loyaltycontrollers "example.com/shop/internal/modules/loyalty/infrastructure/controllers"
	loyaltygateways "example.com/shop/internal/modules/loyalty/infrastructure/gateways"
	loyaltysubscribers "example.com/shop/internal/modules/loyalty/infrastructure/subscribers"
	orderspublished "example.com/shop/internal/modules/orders/application/ports/published"
	"example.com/shop/internal/platform/db"
	"example.com/shop/internal/platform/events"
)

var loyaltyMigrations = db.Migration{Module: "loyalty", Files: loyaltygateways.Migrations}

// composeLoyalty needs nothing from another module: loyalty only REACTS to orders' published event. It subscribes
// its subscriber to the bus and returns its controller.
func composeLoyalty(awards loyaltyoutput.AwardRepository, bus *events.Bus) *loyaltycontrollers.GetPoints {
	orderPlaced := loyaltysubscribers.NewOrderPlaced(loyaltyinteractors.NewAwardPoints(awards))
	bus.Subscribe(orderspublished.OrderPlacedV1Type, func(ctx context.Context, e events.Event) error {
		return orderPlaced.Handle(ctx, e.(orderspublished.OrderPlacedV1))
	})
	return loyaltycontrollers.NewGetPoints(loyaltyinteractors.NewGetPoints(awards))
}

// publishOrderPlaced is what orders gets to announce its event: the bus, behind a function of orders' own contract.
func publishOrderPlaced(bus *events.Bus) func(context.Context, orderspublished.OrderPlacedV1) error {
	return func(ctx context.Context, e orderspublished.OrderPlacedV1) error { return bus.Publish(ctx, e) }
}
