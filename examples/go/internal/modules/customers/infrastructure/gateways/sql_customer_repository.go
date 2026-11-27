// Package gateways implements the customers module's ports against SQL. The *sql.DB is created in
// internal/platform/db and injected by internal/bootstrap: this package never imports platform.
package gateways

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"strings"

	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/application/ports/output"
	"example.com/shop/internal/modules/customers/domain"
)

// Migrations are this module's schema; bootstrap hands them to the runner in platform/db.
//
//go:embed migrations/*.sql
var Migrations embed.FS

var (
	//go:embed queries/find_customer.sql
	findCustomer string
	//go:embed queries/upsert_customer.sql
	upsertCustomer string
)

// customerRow is the persistence model: the row shape, separate from the entity.
type customerRow struct{ id, name, email string }

func toDomain(r customerRow) (*domain.Customer, error) {
	return domain.ReconstituteCustomer(r.id, r.name, r.email) // re-validated, no creation-time effects
}

type SQLCustomerRepository struct{ db *sql.DB }

var _ output.CustomerRepository = (*SQLCustomerRepository)(nil)

func NewSQLCustomerRepository(db *sql.DB) *SQLCustomerRepository {
	return &SQLCustomerRepository{db: db}
}

func (r *SQLCustomerRepository) FindByID(ctx context.Context, id string) (*domain.Customer, error) {
	var row customerRow
	err := r.db.QueryRowContext(ctx, findCustomer, id).Scan(&row.id, &row.name, &row.email)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return toDomain(row)
}

func (r *SQLCustomerRepository) Save(ctx context.Context, c *domain.Customer) error {
	_, err := r.db.ExecContext(ctx, upsertCustomer, c.ID(), c.Name(), c.Email())
	if err != nil && strings.Contains(err.Error(), "customers.email") {
		// Translate the driver's error into the one the port declares (anti-corruption).
		return &interactors.EmailAlreadyRegisteredError{Email: c.Email()}
	}
	return err
}
