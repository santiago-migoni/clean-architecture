package inmemory

import (
	"context"
	"sync"

	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/domain/events"
)

// RecordingOrderEvents keeps the published events so tests can assert on them.
type RecordingOrderEvents struct {
	mu        sync.Mutex
	Published []events.OrderPlaced
}

var _ output.OrderEvents = (*RecordingOrderEvents)(nil)

func (r *RecordingOrderEvents) Publish(_ context.Context, e events.OrderPlaced) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Published = append(r.Published, e)
	return nil
}
