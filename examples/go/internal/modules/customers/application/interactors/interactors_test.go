package interactors

import (
	"context"
	"errors"
	"testing"

	"example.com/shop/internal/modules/customers/domain"
)

// fakeRepo is a local fake: an application test never imports infrastructure (not even the in-memory gateway).
type fakeRepo struct{ byID map[string]*domain.Customer }

func (r *fakeRepo) FindByID(_ context.Context, id string) (*domain.Customer, error) {
	return r.byID[id], nil
}

func (r *fakeRepo) Save(_ context.Context, c *domain.Customer) error {
	for _, other := range r.byID {
		if other.ID() != c.ID() && other.Email() == c.Email() {
			return &EmailAlreadyRegisteredError{Email: c.Email()}
		}
	}
	r.byID[c.ID()] = c
	return nil
}

func TestRegistersAndReadsBackACustomer(t *testing.T) {
	repo := &fakeRepo{byID: map[string]*domain.Customer{}}
	res, err := NewRegisterCustomer(repo, func() string { return "c-1" }).Execute(context.Background(), RegisterCustomerRequest{Name: "Ada", Email: "ADA@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	view, _ := NewGetCustomer(repo).Execute(context.Background(), res.CustomerID)
	if view == nil || view.Email != "ada@example.com" {
		t.Fatalf("got %+v", view)
	}
}

func TestGetReturnsNilForAnUnknownCustomer(t *testing.T) {
	if view, err := NewGetCustomer(&fakeRepo{byID: map[string]*domain.Customer{}}).Execute(context.Background(), "ghost"); view != nil || err != nil {
		t.Fatalf("got %+v, %v", view, err)
	}
}

func TestAnInvalidCustomerIsADomainError(t *testing.T) {
	_, err := NewRegisterCustomer(&fakeRepo{byID: map[string]*domain.Customer{}}, func() string { return "c-1" }).Execute(context.Background(), RegisterCustomerRequest{Name: "Ada", Email: "nope"})
	if !errors.Is(err, domain.ErrInvalidCustomer) {
		t.Fatalf("got %v", err)
	}
}
