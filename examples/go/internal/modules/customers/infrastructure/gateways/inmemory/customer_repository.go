// Package inmemory: non-production gateways, with the same contract as the SQL ones (including the conflict).
package inmemory

import (
	"context"
	"sync"

	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/application/ports/output"
	"example.com/shop/internal/modules/customers/domain"
)

type CustomerRepository struct {
	mu   sync.Mutex
	byID map[string]*domain.Customer
}

var _ output.CustomerRepository = (*CustomerRepository)(nil)

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
