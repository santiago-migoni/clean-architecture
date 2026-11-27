//go:build integration

package gateways

import (
	"context"
	"database/sql"
	"io/fs"
	"testing"

	_ "modernc.org/sqlite" // the test opens its own database; production registers the driver in platform/db

	"example.com/shop/internal/modules/orders/domain"
)

func openDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	files, _ := fs.Glob(Migrations, "migrations/*.sql")
	for _, file := range files {
		migration, _ := fs.ReadFile(Migrations, file)
		if _, err := db.Exec(string(migration)); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func TestRoundTripsAnOrderAndReplacesItsLinesOnSave(t *testing.T) {
	ctx := context.Background()
	repo := NewSQLOrderRepository(openDB(t))
	first, _ := domain.NewOrder("o-1", "c-1", []domain.Line{{ProductID: "p1", Quantity: 2, UnitPriceCents: 1000}, {ProductID: "p2", Quantity: 1, UnitPriceCents: 250}})
	if err := repo.Save(ctx, first); err != nil {
		t.Fatal(err)
	}
	found, err := repo.FindByID(ctx, "o-1")
	if err != nil || found.TotalCents() != 2250 || found.Lines()[0].ProductID != "p1" {
		t.Fatalf("got %+v, %v", found, err)
	}
	second, _ := domain.NewOrder("o-1", "c-1", []domain.Line{{ProductID: "p3", Quantity: 1, UnitPriceCents: 100}})
	_ = repo.Save(ctx, second)
	if found, _ := repo.FindByID(ctx, "o-1"); len(found.Lines()) != 1 || found.Lines()[0].ProductID != "p3" {
		t.Fatalf("lines were not replaced: %+v", found.Lines())
	}
	if missing, err := repo.FindByID(ctx, "missing"); missing != nil || err != nil {
		t.Fatalf("missing id: %+v, %v", missing, err)
	}
}
