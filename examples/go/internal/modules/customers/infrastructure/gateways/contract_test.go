//go:build integration

package gateways

import (
	"context"
	"database/sql"
	"errors"
	"io/fs"
	"testing"

	_ "modernc.org/sqlite" // the test opens its own database; production registers the driver in platform/db

	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/application/ports/output"
	"example.com/shop/internal/modules/customers/domain"
	"example.com/shop/internal/modules/customers/infrastructure/gateways/inmemory"
)

func sqlRepository(t *testing.T) output.CustomerRepository {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1) // one connection: an in-memory database lives in its connection
	files, _ := fs.Glob(Migrations, "migrations/*.sql")
	for _, file := range files {
		migration, _ := fs.ReadFile(Migrations, file)
		if _, err := db.Exec(string(migration)); err != nil {
			t.Fatal(err)
		}
	}
	return NewSQLCustomerRepository(db)
}

// The same scenarios against the SQL and the in-memory repository: both honour the port's contract.
func TestCustomerRepositoryContract(t *testing.T) {
	implementations := map[string]func(*testing.T) output.CustomerRepository{
		"sql":       sqlRepository,
		"in-memory": func(*testing.T) output.CustomerRepository { return inmemory.NewCustomerRepository() },
	}
	for name, newRepo := range implementations {
		t.Run(name, func(t *testing.T) {
			ctx := context.Background()
			repo := newRepo(t)
			ada, _ := domain.NewCustomer("c-1", "Ada", "ada@example.com")
			renamed, _ := domain.NewCustomer("c-1", "Ada L.", "ada@example.com")
			other, _ := domain.NewCustomer("c-2", "Other", "ada@example.com")
			if err := repo.Save(ctx, ada); err != nil {
				t.Fatal(err)
			}
			if err := repo.Save(ctx, renamed); err != nil { // an upsert by id is not a conflict
				t.Fatal(err)
			}
			var conflict *interactors.EmailAlreadyRegisteredError
			if err := repo.Save(ctx, other); !errors.As(err, &conflict) {
				t.Fatalf("want EmailAlreadyRegisteredError, got %v", err)
			}
			if got, _ := repo.FindByID(ctx, "c-1"); got == nil || got.Name() != "Ada L." {
				t.Fatalf("the first customer did not survive: %+v", got) // INSERT OR REPLACE would have deleted it
			}
			if got, err := repo.FindByID(ctx, "missing"); got != nil || err != nil {
				t.Fatalf("missing id: got %+v, %v", got, err)
			}
		})
	}
}
