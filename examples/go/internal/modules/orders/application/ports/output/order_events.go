package output

import (
	"context"

	"example.com/shop/internal/modules/orders/domain/events"
)

// OrderEvents is where the use case announces its domain events. An in-process bus today; a broker tomorrow.
type OrderEvents interface {
	Publish(ctx context.Context, event events.OrderPlaced) error
}
