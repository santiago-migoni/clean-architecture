// Package output declares what the customers use cases need from the outside.
package output

import (
	"context"

	"example.com/shop/internal/modules/customers/domain"
)

type CustomerRepository interface {
	FindByID(ctx context.Context, id string) (*domain.Customer, error) // nil, nil when absent
	// Save is an upsert by id. It fails with *interactors.EmailAlreadyRegisteredError if ANOTHER customer
	// already uses the same email.
	Save(ctx context.Context, c *domain.Customer) error
}
