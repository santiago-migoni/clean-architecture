// Package interactors implements the customers use cases.
package interactors

import (
	"context"

	"example.com/shop/internal/modules/customers/application/ports/output"
	"example.com/shop/internal/modules/customers/domain"
)

type RegisterCustomerRequest struct {
	Name  string
	Email string
}

type RegisterCustomerResponse struct {
	CustomerID string `json:"customerId"`
}

// RegisterCustomer has no Input Port: only a controller of this module calls it.
type RegisterCustomer struct {
	repo  output.CustomerRepository
	newID func() string // injected: randomness does not belong in business rules
}

func NewRegisterCustomer(repo output.CustomerRepository, newID func() string) *RegisterCustomer {
	return &RegisterCustomer{repo: repo, newID: newID}
}

func (uc *RegisterCustomer) Execute(ctx context.Context, req RegisterCustomerRequest) (RegisterCustomerResponse, error) {
	customer, err := domain.NewCustomer(uc.newID(), req.Name, req.Email)
	if err != nil {
		return RegisterCustomerResponse{}, err
	}
	if err := uc.repo.Save(ctx, customer); err != nil {
		return RegisterCustomerResponse{}, err
	}
	return RegisterCustomerResponse{CustomerID: customer.ID()}, nil
}
