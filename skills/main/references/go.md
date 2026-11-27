# Composition root — Go

Packages: `internal/bootstrap` (the wiring: one file per module plus `bootstrap.go`) and one `cmd/<app>/main.go` per entry point (api, worker, cli), each only calling bootstrap and running. Same-named packages of different modules are imported with a `<module><package>` alias.

## One function per module

```go
// internal/bootstrap/customers.go
package bootstrap

import (
	"database/sql"

	customersinteractors "example.com/shop/internal/modules/customers/application/interactors"
	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
	customersgateways "example.com/shop/internal/modules/customers/infrastructure/gateways"
)

type customersModule struct {
	GetCustomer customersinput.GetCustomer // the input port other modules may use
}

func composeCustomers(db *sql.DB) customersModule {
	repo := customersgateways.NewSQLCustomerRepository(db)
	return customersModule{GetCustomer: customersinteractors.NewGetCustomer(repo)}
}
```

```go
// internal/bootstrap/orders.go
package bootstrap

import (
	"database/sql"
	"net/http"

	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
	ordersinteractors "example.com/shop/internal/modules/orders/application/interactors"
	orderscontrollers "example.com/shop/internal/modules/orders/infrastructure/controllers"
	ordersgateways "example.com/shop/internal/modules/orders/infrastructure/gateways"
)

// getCustomer is customers' INPUT port: the only legal cross-module link.
func composeOrders(db *sql.DB, newID func() string, getCustomer customersinput.GetCustomer) http.Handler {
	placeOrder := ordersinteractors.NewPlaceOrder(
		ordersgateways.NewSQLOrderRepository(db),
		ordersgateways.NewCustomerLookupGateway(getCustomer),
		newID,
	)
	return orderscontrollers.NewPlaceOrder(placeOrder)
}
```

## The composition root and the entry point

```go
// internal/bootstrap/bootstrap.go — the ONLY package that imports concrete implementations of every
// module and layer. Only cmd/ imports it.
package bootstrap

import (
	"database/sql"
	"net/http"

	"github.com/google/uuid"

	"example.com/shop/internal/platform/db"
	"example.com/shop/internal/platform/web"
)

type Config struct{ DatabaseURL string }

// New wires every module and returns the HTTP handler. Configuration comes from cmd/, never from os.Getenv here.
func New(cfg Config) (http.Handler, *sql.DB, error) {
	conn, err := db.Open(cfg.DatabaseURL) // driver registration and migrations live in platform/db
	if err != nil {
		return nil, nil, err
	}
	newID := func() string { return uuid.NewString() }

	customers := composeCustomers(conn)
	placeOrder := composeOrders(conn, newID, customers.GetCustomer)

	return web.NewMux(web.Handlers{PlaceOrder: placeOrder}), conn, nil
}
```

```go
// cmd/api/main.go — reads the environment, calls bootstrap, serves. No wiring here.
package main

import (
	"log"
	"net/http"
	"os"

	"example.com/shop/internal/bootstrap"
)

func main() {
	handler, conn, err := bootstrap.New(bootstrap.Config{DatabaseURL: os.Getenv("DATABASE_URL")})
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	log.Fatal(http.ListenAndServe(":"+os.Getenv("PORT"), handler))
}
```

## Test composition root — the same ports, in-memory implementations

```go
// internal/bootstrap/testing.go
package bootstrap

import (
	"fmt"
	"net/http"

	customersinteractors "example.com/shop/internal/modules/customers/application/interactors"
	customersinmemory "example.com/shop/internal/modules/customers/infrastructure/gateways/inmemory"
	ordersinteractors "example.com/shop/internal/modules/orders/application/interactors"
	orderscontrollers "example.com/shop/internal/modules/orders/infrastructure/controllers"
	ordersgateways "example.com/shop/internal/modules/orders/infrastructure/gateways"
	ordersinmemory "example.com/shop/internal/modules/orders/infrastructure/gateways/inmemory"
	"example.com/shop/internal/platform/web"
)

// NewForTest wires the same use cases on in-memory gateways, with deterministic ids.
func NewForTest() (http.Handler, *customersinmemory.CustomerRepository) {
	n := 0
	newID := func() string { n++; return fmt.Sprintf("id-%d", n) }
	customers := customersinmemory.NewCustomerRepository()
	getCustomer := customersinteractors.NewGetCustomer(customers)
	placeOrder := ordersinteractors.NewPlaceOrder(ordersinmemory.NewOrderRepository(), ordersgateways.NewCustomerLookupGateway(getCustomer), newID)
	return web.NewMux(web.Handlers{PlaceOrder: orderscontrollers.NewPlaceOrder(placeOrder)}), customers
}
```

With an Output Port, the module function returns a factory that builds a NEW presenter per request (see the `presenter` reference).
