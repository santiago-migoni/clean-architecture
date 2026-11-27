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
		reason     InvalidOrderReason
	}{
		{"", []Line{line}, ReasonCustomerRequired},
		{"c-1", nil, ReasonNoLines},
		{"c-1", []Line{{ProductID: "", Quantity: 1}}, ReasonProductRequired},
		{"c-1", []Line{{ProductID: "p", Quantity: 0}}, ReasonInvalidQuantity},
		{"c-1", []Line{{ProductID: "p", Quantity: 1, UnitPriceCents: -1}}, ReasonInvalidUnitPrice},
	}
	for _, tc := range cases {
		_, err := NewOrder("o-1", tc.customerID, tc.lines)
		var invalid *InvalidOrderError
		if !errors.Is(err, ErrInvalidOrder) || !errors.As(err, &invalid) || invalid.Reason != tc.reason {
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
