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
	for _, tc := range []struct {
		name, email string
		reason      InvalidCustomerReason
	}{{"", "a@b.co", ReasonNameRequired}, {"Ada", "not-an-email", ReasonInvalidEmail}} {
		_, err := NewCustomer("c-1", tc.name, tc.email)
		var invalid *InvalidCustomerError
		if !errors.Is(err, ErrInvalidCustomer) || !errors.Is(err, shared.ErrBusinessRule) || !errors.As(err, &invalid) || invalid.Reason != tc.reason {
			t.Fatalf("%+v: got %v", tc, err)
		}
	}
}

func TestReconstituteRunsTheSameInvariants(t *testing.T) {
	if _, err := ReconstituteCustomer("c-1", "Ada", "broken"); !errors.Is(err, ErrInvalidCustomer) {
		t.Fatalf("got %v", err)
	}
}
