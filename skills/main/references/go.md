# Composition root — Go

The complete, tested version of this code is [`examples/go`](../../../examples/go): the same application in every language.

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

## Configuration — read once, validated, passed as values

```go
// internal/bootstrap/settings.go — a pure function of the lookup it is given: bootstrap never calls os.Getenv.
package bootstrap

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

type Settings struct {
	DatabaseURL string
	Port        int
}

var digits = regexp.MustCompile(`^\d+$`)

// LoadSettings reads DATABASE_URL and PORT through getenv (os.Getenv in production, a map in tests).
func LoadSettings(getenv func(string) string) (Settings, error) {
	url := strings.TrimSpace(getenv("DATABASE_URL"))
	if url == "" {
		return Settings{}, fmt.Errorf("invalid configuration: DATABASE_URL is required")
	}
	portText := strings.TrimSpace(getenv("PORT"))
	if portText == "" {
		portText = "8080"
	}
	port := 0
	if digits.MatchString(portText) {
		port, _ = strconv.Atoi(portText)
	}
	if port < 1 || port > 65535 {
		return Settings{}, fmt.Errorf("invalid configuration: PORT must be a whole number from 1 to 65535, got %q", portText)
	}
	return Settings{DatabaseURL: url, Port: port}, nil
}
```

```go
// cmd/api/main.go — the entry point, and the only file that touches os.Getenv. No wiring here.
package main

import (
	"log"
	"net/http"
	"os"
	"strconv"

	"example.com/shop/internal/bootstrap"
)

func main() {
	settings, err := bootstrap.LoadSettings(os.Getenv) // a wrong setting stops here, before anything starts
	if err != nil {
		log.Fatal(err)
	}
	handler, conn, err := bootstrap.New(bootstrap.Config{DatabaseURL: settings.DatabaseURL})
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()
	log.Fatal(http.ListenAndServe(":"+strconv.Itoa(settings.Port), handler))
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

// TestApp exposes what tests assert on, next to the handler.
type TestApp struct {
	Handler   http.Handler
	Customers *customersinmemory.CustomerRepository
}

// NewForTest wires the same use cases on in-memory gateways, with deterministic ids.
func NewForTest() TestApp {
	n := 0
	newID := func() string { n++; return fmt.Sprintf("id-%d", n) }
	customers := customersinmemory.NewCustomerRepository()
	getCustomer := customersinteractors.NewGetCustomer(customers)
	placeOrder := ordersinteractors.NewPlaceOrder(ordersinmemory.NewOrderRepository(), ordersgateways.NewCustomerLookupGateway(getCustomer), newID)
	return TestApp{Handler: web.NewMux(web.Handlers{PlaceOrder: orderscontrollers.NewPlaceOrder(placeOrder)}), Customers: customers}
}
```

With an Output Port, the module function returns a factory that builds a NEW presenter per request (see the `presenter` reference).
