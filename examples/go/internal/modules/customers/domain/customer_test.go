package domain

import (
	"errors"
	"testing"

	"example.com/shop/internal/shared"
)

func TestNewCustomerNormalisesNameAndEmail(t *testing.T) {
	c, err := NewCustomer("c-1", "  Ada ", " ADA@Example.com ")
	if err != nil || c.Name() != "Ada" || c.Email() != "ada@example.com" {
		t.Fatalf("got %+v, %v", c, err)
	}
}

func TestInvalidCustomersAreRejectedWithTheModuleAndTheSharedError(t *testing.T) {
	for _, tc := range []struct{ name, email string }{{"", "a@b.co"}, {"Ada", "not-an-email"}} {
		_, err := NewCustomer("c-1", tc.name, tc.email)
		if !errors.Is(err, ErrInvalidCustomer) || !errors.Is(err, shared.ErrBusinessRule) {
			t.Fatalf("%+v: got %v", tc, err)
		}
	}
}

func TestReconstituteRunsTheSameInvariants(t *testing.T) {
	if _, err := ReconstituteCustomer("c-1", "Ada", "broken"); !errors.Is(err, ErrInvalidCustomer) {
		t.Fatalf("got %v", err)
	}
}
