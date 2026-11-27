// Package inmemory: non-production gateways for the test composition root.
package inmemory

import (
	"context"
	"sync"

	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/domain"
)

type OrderRepository struct {
	mu   sync.Mutex
	byID map[string]*domain.Order
}

var _ output.OrderRepository = (*OrderRepository)(nil)

func NewOrderRepository() *OrderRepository { return &OrderRepository{byID: map[string]*domain.Order{}} }

func (r *OrderRepository) FindByID(_ context.Context, id string) (*domain.Order, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.byID[id], nil
}

func (r *OrderRepository) Save(_ context.Context, o *domain.Order) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.byID[o.ID()] = o
	return nil
}

func (r *OrderRepository) Count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.byID)
}
