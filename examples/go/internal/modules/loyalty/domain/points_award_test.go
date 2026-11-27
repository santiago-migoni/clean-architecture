package domain

import (
	"errors"
	"testing"

	"example.com/shop/internal/shared"
)

func TestOnePointPerWholeDollar(t *testing.T) {
	for cents, points := range map[int]int{0: 0, 99: 0, 100: 1, 1750: 17, 123456: 1234} {
		if a, err := NewPointsAwardForOrder("o-1", "c-1", cents); err != nil || a.Points() != points {
			t.Errorf("%d cents: got %v %v, want %d points", cents, a, err, points)
		}
	}
}

func TestAnInvalidAwardIsRejectedWithAStableReason(t *testing.T) {
	for _, tc := range []struct {
		orderID, customerID string
		cents               int
		reason              InvalidPointsAwardReason
	}{
		{"", "c-1", 100, ReasonOrderRequired},
		{"o-1", " ", 100, ReasonCustomerRequired},
		{"o-1", "c-1", -1, ReasonInvalidTotal},
	} {
		_, err := NewPointsAwardForOrder(tc.orderID, tc.customerID, tc.cents)
		var invalid *InvalidPointsAwardError
		if !errors.As(err, &invalid) || invalid.Reason != tc.reason || !errors.Is(err, shared.ErrBusinessRule) {
			t.Errorf("%+v: got %v", tc, err)
		}
	}
}
