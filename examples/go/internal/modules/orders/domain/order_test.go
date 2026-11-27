package domain

import (
	"errors"
	"testing"
)

var line = Line{ProductID: "p-1", Quantity: 2, UnitPriceCents: 1250}

func TestNewOrderStartsPendingAndTotalsItsLines(t *testing.T) {
	o, err := NewOrder("o-1", "c-1", []Line{line, {ProductID: "p-2", Quantity: 1, UnitPriceCents: 500}})
	if err != nil || o.Status() != StatusPending || o.TotalCents() != 3000 || !o.CanBeCancelled() {
		t.Fatalf("got %+v, %v", o, err)
	}
}

func TestInvalidOrdersAreRejected(t *testing.T) {
	cases := []struct {
		customerID string
		lines      []Line
	}{
		{"", []Line{line}},
		{"c-1", nil},
		{"c-1", []Line{{ProductID: "", Quantity: 1}}},
		{"c-1", []Line{{ProductID: "p", Quantity: 0}}},
		{"c-1", []Line{{ProductID: "p", Quantity: 1, UnitPriceCents: -1}}},
	}
	for _, tc := range cases {
		if _, err := NewOrder("o-1", tc.customerID, tc.lines); !errors.Is(err, ErrInvalidOrder) {
			t.Fatalf("%+v: got %v", tc, err)
		}
	}
}

func TestACancelledOrderCannotBeCancelledAgain(t *testing.T) {
	o, _ := Reconstitute("o-1", "c-1", []Line{line}, StatusCancelled)
	if o.CanBeCancelled() {
		t.Fatal("a cancelled order cannot be cancelled")
	}
}
