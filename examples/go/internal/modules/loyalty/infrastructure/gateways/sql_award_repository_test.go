//go:build integration

package gateways

import (
	"context"
	"database/sql"
	"io/fs"
	"testing"

	_ "modernc.org/sqlite" // the test opens its own database; production registers the driver in platform/db

	"example.com/shop/internal/modules/loyalty/domain"
)

// openDB runs loyalty's own migrations only: it needs none of another module's tables.
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

func award(t *testing.T, orderID, customerID string, cents int) *domain.PointsAward {
	a, err := domain.NewPointsAwardForOrder(orderID, customerID, cents)
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func TestAddsUpThePointsOfACustomerAnd0ForAnUnknownOne(t *testing.T) {
	ctx, repo := context.Background(), NewSQLAwardRepository(openDB(t))
	for _, a := range []*domain.PointsAward{award(t, "o-1", "c-1", 1750), award(t, "o-2", "c-1", 500), award(t, "o-3", "c-2", 9900)} {
		if _, err := repo.Add(ctx, a); err != nil {
			t.Fatal(err)
		}
	}
	c1, _ := repo.PointsOf(ctx, "c-1")
	ghost, _ := repo.PointsOf(ctx, "ghost")
	if c1 != 22 || ghost != 0 {
		t.Fatalf("got %d and %d", c1, ghost)
	}
}

func TestIgnoresASecondAwardForTheSameOrder(t *testing.T) {
	ctx, repo := context.Background(), NewSQLAwardRepository(openDB(t))
	first, _ := repo.Add(ctx, award(t, "o-1", "c-1", 1000))
	second, _ := repo.Add(ctx, award(t, "o-1", "c-1", 99900))
	points, _ := repo.PointsOf(ctx, "c-1")
	if !first || second || points != 10 {
		t.Fatalf("first %v, second %v, points %d", first, second, points)
	}
}
