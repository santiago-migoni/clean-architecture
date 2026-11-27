// Package events delivers integration events to the subscribers bootstrap registered, in the same process. A driver,
// like the database: replacing it with a broker (and an outbox) changes no module.
//
// Delivery is synchronous and in order, after the publisher stored its change. A subscriber that fails (an error or
// a panic) is reported and never fails the publisher: the order is placed whatever loyalty does. There is no retry:
// an event whose subscriber failed is lost for that subscriber (at most once). An outbox, written in the same
// transaction as the change and published afterwards, is what makes it at least once.
package events

import (
	"context"
	"fmt"
)

// Event is any integration event: a published contract names itself.
type Event interface{ EventType() string }

type Handler func(context.Context, Event) error

type Bus struct {
	byType  map[string][]Handler
	all     []Handler
	onError func(error, Event)
}

func NewBus(onError func(error, Event)) *Bus {
	return &Bus{byType: map[string][]Handler{}, onError: onError}
}

func (b *Bus) Subscribe(eventType string, h Handler) {
	b.byType[eventType] = append(b.byType[eventType], h)
}

// SubscribeAll receives every event, whatever its type: an audit log, a tracer.
func (b *Bus) SubscribeAll(h Handler) { b.all = append(b.all, h) }

// Publish never returns a subscriber's failure: it reports it and goes on with the next subscriber.
func (b *Bus) Publish(ctx context.Context, e Event) error {
	for _, h := range append(append([]Handler{}, b.byType[e.EventType()]...), b.all...) {
		if err := deliver(ctx, h, e); err != nil {
			b.onError(err, e)
		}
	}
	return nil
}

func deliver(ctx context.Context, h Handler, e Event) (err error) {
	defer func() {
		if v := recover(); v != nil {
			err = fmt.Errorf("subscriber panicked: %v", v)
		}
	}()
	return h(ctx, e)
}
