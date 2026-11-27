// Package inmemory is a non-production gateway, used by tests and local runs.
package inmemory

import "example.com/shop/internal/modules/orders/domain"

type OrderRepository struct{ orders []domain.Order }

func NewOrderRepository() *OrderRepository { return &OrderRepository{} }

func (r *OrderRepository) Save(order domain.Order) error {
	r.orders = append(r.orders, order)
	return nil
}

func (r *OrderRepository) Count() int { return len(r.orders) }
