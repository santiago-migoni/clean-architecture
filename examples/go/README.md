# Example (Go): orders + customers

The Go version of the plugin's reference example: the same application, pieces and tests as the
[TypeScript](../typescript) and [Python](../python) versions. [The overview](../README.md) lists every piece and why it is there.

`net/http` · SQLite (`modernc.org/sqlite`, pure Go) · `go test` · go-arch-lint. Requires Go 1.26+.

```bash
cd examples/go
go vet ./...
go test ./...                       # unit tests and HTTP e2e (both composition roots)
go test -tags integration ./...     # plus the SQL gateways against SQLite
go-arch-lint check                  # both architecture rules, declared per module
go run ./cmd/api                    # http://localhost:8080  (PORT and DB_PATH are optional)
```

## Structure

```
cmd/api/main.go                    entry point: environment → bootstrap → serve
internal/
├── modules/
│   ├── customers/
│   │   ├── domain/                customer.go, errors.go
│   │   ├── application/
│   │   │   ├── ports/input/       get_customer.go          ← public surface: orders calls it
│   │   │   ├── ports/output/      customer_repository.go
│   │   │   └── interactors/       register_customer.go, get_customer.go, errors.go
│   │   └── infrastructure/
│   │       ├── controllers/       controllers.go (http.Handlers)
│   │       └── gateways/          sql_customer_repository.go, queries/*.sql, migrations/*.sql, inmemory/
│   └── orders/
│       ├── domain/                order.go, errors.go, events/order_placed.go
│       ├── application/
│       │   ├── ports/output/      order_repository.go, customer_lookup.go, order_events.go, place_order_output.go
│       │   └── interactors/       place_order.go, errors.go
│       └── infrastructure/
│           ├── controllers/       place_order.go
│           ├── presenters/        place_order.go
│           └── gateways/          sql_order_repository.go, customer_lookup_gateway.go, audit_log_order_events.go,
│                                  queries/*.sql, migrations/*.sql, inmemory/
├── shared/                        domain_error.go   ← ErrBusinessRule, wrapped by every module's domain error
├── platform/                      db/ (open, migrate) · web/ (routes, PlaceOrder view, recovery)
└── bootstrap/                     bootstrap.go (New) · settings.go (LoadSettings) · customers.go · orders.go · testing.go (NewForTest) · e2e_test.go
```

## Go-specific decisions

- **Tests sit beside the code and are scanned with their layer.** So a use case test uses small local fakes,
  never the in-memory gateways (that import would be `application → infrastructure`). The in-memory gateways
  serve the test composition root (`bootstrap.NewForTest`) and the repository contract test.
- **Queries live in `.sql` files** (`gateways/queries/`), embedded with `//go:embed`; migrations too, handed by
  `bootstrap` to the runner in `platform/db`. `ca-scan` checks their placement and table ownership like any SQL.
- **Errors are values**: `shared.ErrBusinessRule` is wrapped by `ErrInvalidOrder` / `ErrInvalidCustomer`;
  controllers and the presenter match with `errors.Is` / `errors.As`. An unexpected error panics up to the
  recovery middleware in `platform/web`, which logs it and answers 500 without internals.
- **Gateway tests against SQLite carry `//go:build integration`** and open their own database (with the
  module's embedded migrations), so they never import `platform/`.
