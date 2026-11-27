package domain

import "testing"

func TestNewOrderRejectsZeroQuantity(t *testing.T) {
	if _, err := NewOrder("o-1", "c-1", 0); err != ErrInvalidQuantity {
		t.Fatalf("want ErrInvalidQuantity, got %v", err)
	}
}
