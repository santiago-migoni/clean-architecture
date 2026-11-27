// Package gateways implements the loyalty module's ports against SQL. The *sql.DB is created in
// internal/platform/db and injected by internal/bootstrap: this package never imports platform.
package gateways

import (
	"context"
	"database/sql"
	"embed"

	"example.com/shop/internal/modules/loyalty/application/ports/output"
	"example.com/shop/internal/modules/loyalty/domain"
)

// Migrations are this module's schema; bootstrap hands them to the runner in platform/db.
//
//go:embed migrations/*.sql
var Migrations embed.FS

var (
	//go:embed queries/add_award.sql
	addAward string
	//go:embed queries/points_of.sql
	pointsOf string
)

type SQLAwardRepository struct{ db *sql.DB }

var _ output.AwardRepository = (*SQLAwardRepository)(nil)

func NewSQLAwardRepository(db *sql.DB) *SQLAwardRepository { return &SQLAwardRepository{db: db} }

func (r *SQLAwardRepository) Add(ctx context.Context, a *domain.PointsAward) (bool, error) {
	res, err := r.db.ExecContext(ctx, addAward, a.OrderID(), a.CustomerID(), a.Points())
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

func (r *SQLAwardRepository) PointsOf(ctx context.Context, customerID string) (int, error) {
	var points int
	err := r.db.QueryRowContext(ctx, pointsOf, customerID).Scan(&points)
	return points, err
}
