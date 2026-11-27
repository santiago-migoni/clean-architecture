// Package output declares the ports the orders use cases need. One file per port.
package output

import (
	"context"

	"example.com/shop/internal/modules/orders/domain"
)

type OrderRepository interface {
	FindByID(ctx context.Context, id string) (*domain.Order, error) // nil, nil when absent
	Save(ctx context.Context, order *domain.Order) error
}
