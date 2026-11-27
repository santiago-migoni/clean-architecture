package events

import (
	"context"
	"errors"
	"slices"
	"testing"
)

type event string

func (e event) EventType() string { return string(e) }

const placed, other = event("orders.order-placed.v1"), event("customers.customer-registered.v1")

func TestDeliversToTheSubscribersOfItsTypeInOrderAndToEveryCatchAllSubscriber(t *testing.T) {
	bus := NewBus(func(error, Event) {})
	var seen []string
	record := func(s string) Handler {
		return func(_ context.Context, e Event) error { seen = append(seen, s+e.EventType()); return nil }
	}
	bus.Subscribe(placed.EventType(), record("first:"))
	bus.Subscribe(placed.EventType(), record("second:"))
	bus.SubscribeAll(record("all:"))
	_ = bus.Publish(context.Background(), placed)
	_ = bus.Publish(context.Background(), other)
	want := []string{"first:" + string(placed), "second:" + string(placed), "all:" + string(placed), "all:" + string(other)}
	if !slices.Equal(seen, want) {
		t.Fatalf("got %v", seen)
	}
}

func TestAFailingSubscriberIsReportedAndNeverStopsTheOthersNorFailsThePublisher(t *testing.T) {
	var reported []error
	bus := NewBus(func(err error, _ Event) { reported = append(reported, err) })
	boom := errors.New("loyalty is down")
	after := 0
	bus.Subscribe(placed.EventType(), func(context.Context, Event) error { return boom })
	bus.Subscribe(placed.EventType(), func(context.Context, Event) error { panic("a bug") })
	bus.Subscribe(placed.EventType(), func(context.Context, Event) error { after++; return nil })
	if err := bus.Publish(context.Background(), placed); err != nil || after != 1 || len(reported) != 2 || !errors.Is(reported[0], boom) {
		t.Fatalf("err %v, after %d, reported %v", err, after, reported)
	}
}
