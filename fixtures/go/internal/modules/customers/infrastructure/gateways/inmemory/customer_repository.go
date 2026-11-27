// Package inmemory is a non-production gateway, used by tests and local runs.
package inmemory

import "example.com/shop/internal/modules/customers/domain"

type CustomerRepository struct{ byID map[string]domain.Customer }

func NewCustomerRepository(seed ...domain.Customer) *CustomerRepository {
	r := &CustomerRepository{byID: map[string]domain.Customer{}}
	for _, c := range seed {
		r.byID[c.ID] = c
	}
	return r
}

func (r *CustomerRepository) FindByID(id string) (*domain.Customer, error) {
	c, ok := r.byID[id]
	if !ok {
		return nil, nil
	}
	return &c, nil
}
