// Package bootstrap is the composition root: the ONLY package that imports concrete implementations of every
// module and layer. Only cmd/ imports it. Configuration comes from cmd/, never from os.Getenv here.
package bootstrap

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"

	loyaltygateways "example.com/shop/internal/modules/loyalty/infrastructure/gateways"
	ordersgateways "example.com/shop/internal/modules/orders/infrastructure/gateways"
	"example.com/shop/internal/platform/db"
	"example.com/shop/internal/platform/events"
	"example.com/shop/internal/platform/web"
)

type Config struct {
	DatabaseDSN string       // ":memory:" or a file path
	AuditLog    func(string) // where every integration event is written, one line each
}

// New wires every module on SQLite and returns the HTTP handler and the connection (for the caller to close).
func New(cfg Config) (http.Handler, *sql.DB, error) {
	// 1. Drivers (platform)
	conn, err := db.Open(cfg.DatabaseDSN)
	if err != nil {
		return nil, nil, err
	}
	if err := db.Migrate(conn, []db.Migration{customersMigrations, ordersMigrations, loyaltyMigrations}); err != nil {
		return nil, nil, err
	}
	// A failing subscriber is logged and never fails the publisher (see platform/events).
	bus := events.NewBus(func(err error, e events.Event) { log.Printf("Subscriber failed on %s: %v", e.EventType(), err) })

	// 2. Modules in dependency order. Two kinds of tie between modules: orders CALLS customers through its input
	//    port; loyalty REACTS to orders' published event, subscribed to the bus.
	defaultLocale := Locales[0]
	customers := composeCustomers(sqlCustomers(conn), newID, defaultLocale)
	orderEvents := ordersgateways.NewPublishedOrderEvents(publishOrderPlaced(bus))
	makePlaceOrder := composeOrders(ordersgateways.NewSQLOrderRepository(conn), orderEvents, newID, customers.GetCustomer, defaultLocale)
	getPoints := composeLoyalty(loyaltygateways.NewSQLAwardRepository(conn), bus)
	bus.SubscribeAll(auditTrail(cfg.AuditLog)) // every integration event, whoever publishes it

	// 3. Delivery
	handlers := web.Handlers{RegisterCustomer: customers.RegisterCustomer, GetCustomer: customers.GetController, MakePlaceOrder: makePlaceOrder, GetPoints: getPoints}
	return web.NewHandler(handlers, Locales), conn, nil
}

// auditTrail writes one line per integration event: its type and its JSON.
func auditTrail(write func(string)) events.Handler {
	return func(_ context.Context, e events.Event) error {
		data, err := json.Marshal(e)
		if err != nil {
			return err
		}
		write(e.EventType() + " " + string(data))
		return nil
	}
}

// newID returns a random 128-bit id: randomness is injected into the use cases, never used by them directly.
func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
