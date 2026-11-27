// Package bootstrap is the composition root: the ONLY package that imports concrete implementations of every
// module and layer. Only cmd/ imports it. Configuration comes from cmd/, never from os.Getenv here.
package bootstrap

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"net/http"

	ordersgateways "example.com/shop/internal/modules/orders/infrastructure/gateways"
	"example.com/shop/internal/platform/db"
	"example.com/shop/internal/platform/web"
)

type Config struct {
	DatabaseDSN string       // ":memory:" or a file path
	AuditLog    func(string) // where OrderPlaced events are written
}

// New wires every module on SQLite and returns the HTTP handler and the connection (for the caller to close).
func New(cfg Config) (http.Handler, *sql.DB, error) {
	// 1. Drivers (platform)
	conn, err := db.Open(cfg.DatabaseDSN)
	if err != nil {
		return nil, nil, err
	}
	if err := db.Migrate(conn, []db.Migration{customersMigrations, ordersMigrations}); err != nil {
		return nil, nil, err
	}
	// 2. Modules in dependency order; the cross-module tie is an input port
	defaultLocale := Locales[0]
	customers := composeCustomers(sqlCustomers(conn), newID, defaultLocale)
	makePlaceOrder := composeOrders(ordersgateways.NewSQLOrderRepository(conn), ordersgateways.NewAuditLogOrderEvents(cfg.AuditLog), newID, customers.GetCustomer, defaultLocale)
	// 3. Delivery
	return web.NewHandler(web.Handlers{RegisterCustomer: customers.RegisterCustomer, GetCustomer: customers.GetController, MakePlaceOrder: makePlaceOrder}, Locales), conn, nil
}

// newID returns a random 128-bit id: randomness is injected into the use cases, never used by them directly.
func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
