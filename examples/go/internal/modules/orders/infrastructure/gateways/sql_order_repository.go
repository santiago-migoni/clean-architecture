// Package gateways implements the orders module's ports: SQL persistence, the customers lookup and the audit
// log. The *sql.DB and the audit sink are injected by internal/bootstrap; this package never imports platform.
package gateways

import (
	"context"
	"database/sql"
	"embed"
	"errors"

	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/domain"
)

// Migrations are this module's schema; bootstrap hands them to the runner in platform/db.
//
//go:embed migrations/*.sql
var Migrations embed.FS

var (
	//go:embed queries/find_order.sql
	findOrder string
	//go:embed queries/find_order_lines.sql
	findOrderLines string
	//go:embed queries/upsert_order.sql
	upsertOrder string
	//go:embed queries/delete_order_lines.sql
	deleteOrderLines string
	//go:embed queries/insert_order_line.sql
	insertOrderLine string
)

type SQLOrderRepository struct{ db *sql.DB }

var _ output.OrderRepository = (*SQLOrderRepository)(nil)

func NewSQLOrderRepository(db *sql.DB) *SQLOrderRepository { return &SQLOrderRepository{db: db} }

func (r *SQLOrderRepository) FindByID(ctx context.Context, id string) (*domain.Order, error) {
	var customerID, status string
	err := r.db.QueryRowContext(ctx, findOrder, id).Scan(&id, &customerID, &status)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, findOrderLines, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var lines []domain.Line
	for rows.Next() {
		var l domain.Line
		if err := rows.Scan(&l.ProductID, &l.Quantity, &l.UnitPriceCents); err != nil {
			return nil, err
		}
		lines = append(lines, l)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return domain.Reconstitute(id, customerID, lines, domain.Status(status))
}

// Save stores the order and replaces its lines, in one transaction.
func (r *SQLOrderRepository) Save(ctx context.Context, o *domain.Order) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // a no-op after Commit
	if _, err := tx.ExecContext(ctx, upsertOrder, o.ID(), o.CustomerID(), string(o.Status())); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, deleteOrderLines, o.ID()); err != nil {
		return err
	}
	for position, l := range o.Lines() {
		if _, err := tx.ExecContext(ctx, insertOrderLine, o.ID(), position, l.ProductID, l.Quantity, l.UnitPriceCents); err != nil {
			return err
		}
	}
	return tx.Commit()
}
