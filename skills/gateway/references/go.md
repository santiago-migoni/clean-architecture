# Gateway — Go

Packages under `internal/modules/<module>/infrastructure/`: `gateways` (or a technology-named package such as `postgres`), `gateways/inmemory`, and the SQL migrations in `gateways/migrations/`. The examples use `database/sql`; the driver is registered in `internal/platform/db/` and the `*sql.DB` is injected by `internal/bootstrap`. SQL itself: see the [SQL reference](sql.md).

## SQL gateway with its row mapping

The row type and the mapper stay in the gateway file: they are the persistence model.

```go
// internal/modules/customers/infrastructure/gateways/sql_customer_repository.go
package gateways

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/domain"
)

type customerRow struct{ id, name, email string }

func toDomain(r customerRow) (*domain.Customer, error) {
	return domain.ReconstituteCustomer(r.id, r.name, r.email) // re-validates, no creation effects
}

type SQLCustomerRepository struct{ db *sql.DB }

func NewSQLCustomerRepository(db *sql.DB) *SQLCustomerRepository { return &SQLCustomerRepository{db: db} }

func (r *SQLCustomerRepository) FindByID(ctx context.Context, id string) (*domain.Customer, error) {
	var row customerRow
	err := r.db.QueryRowContext(ctx, `SELECT id, name, email FROM customers WHERE id = ?`, id).Scan(&row.id, &row.name, &row.email)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return toDomain(row)
}

func (r *SQLCustomerRepository) Save(ctx context.Context, c *domain.Customer) error {
	// Upsert by id. Never INSERT OR REPLACE / REPLACE INTO: it would delete another customer with the same email.
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO customers (id, name, email) VALUES (?, ?, ?)
		 ON CONFLICT (id) DO UPDATE SET name = excluded.name, email = excluded.email`,
		c.ID(), c.Name(), c.Email())
	if err != nil && strings.Contains(err.Error(), "customers.email") {
		// Translate the driver's error into the one the port declares (anti-corruption).
		return &interactors.EmailAlreadyRegisteredError{Email: c.Email()}
	}
	return err
}
```

Matching on the driver's message is the last resort; prefer its typed error (`*pgconn.PgError` with code `23505` and the constraint name, for PostgreSQL).

## In-memory gateway (created when the first test needs it)

```go
// internal/modules/customers/infrastructure/gateways/inmemory/customer_repository.go
// Package inmemory: non-production gateways, same contract as the SQL ones (including the conflict).
package inmemory

import (
	"context"
	"sync"

	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/domain"
)

type CustomerRepository struct {
	mu   sync.Mutex
	byID map[string]*domain.Customer
}

func NewCustomerRepository() *CustomerRepository {
	return &CustomerRepository{byID: map[string]*domain.Customer{}}
}

func (r *CustomerRepository) FindByID(_ context.Context, id string) (*domain.Customer, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.byID[id], nil
}

func (r *CustomerRepository) Save(_ context.Context, c *domain.Customer) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, other := range r.byID {
		if other.ID() != c.ID() && other.Email() == c.Email() {
			return &interactors.EmailAlreadyRegisteredError{Email: c.Email()}
		}
	}
	r.byID[c.ID()] = c
	return nil
}
```

## Gateway that reaches another module

```go
// internal/modules/orders/infrastructure/gateways/customer_lookup_gateway.go
// The only cross-module import allowed: this module's infrastructure → the other module's input port.
package gateways

import (
	"context"

	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
	"example.com/shop/internal/modules/orders/application/ports/output"
)

type CustomerLookupGateway struct{ getCustomer customersinput.GetCustomer }

var _ output.CustomerLookup = (*CustomerLookupGateway)(nil)

func NewCustomerLookupGateway(getCustomer customersinput.GetCustomer) *CustomerLookupGateway {
	return &CustomerLookupGateway{getCustomer: getCustomer}
}

func (g *CustomerLookupGateway) Exists(ctx context.Context, customerID string) (bool, error) {
	view, err := g.getCustomer.Execute(ctx, customerID)
	return view != nil, err // orders only needs a boolean
}
```

## Integration test — real database, behind a build tag

Run with `go test -tags integration ./...`; the default `go test ./...` stays fast and needs no database.

```go
//go:build integration

// internal/modules/customers/infrastructure/gateways/sql_customer_repository_test.go
package gateways

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"testing"

	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/domain"
	_ "modernc.org/sqlite" // the test picks a driver; production registers it in platform/db
)

func openDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	migration, err := os.ReadFile("migrations/001_create_customers.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(migration)); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestSameEmailIsAConflictAndTheFirstCustomerSurvives(t *testing.T) {
	ctx := context.Background()
	repo := NewSQLCustomerRepository(openDB(t))
	ada, _ := domain.NewCustomer("c-1", "Ada", "ada@example.com")
	other, _ := domain.NewCustomer("c-2", "Other", "ada@example.com")
	if err := repo.Save(ctx, ada); err != nil {
		t.Fatal(err)
	}
	var conflict *interactors.EmailAlreadyRegisteredError
	if err := repo.Save(ctx, other); !errors.As(err, &conflict) {
		t.Fatalf("want EmailAlreadyRegisteredError, got %v", err)
	}
	if got, _ := repo.FindByID(ctx, "c-1"); got == nil || got.Name() != "Ada" {
		t.Fatalf("the first customer did not survive: %v", got)
	}
}
```
