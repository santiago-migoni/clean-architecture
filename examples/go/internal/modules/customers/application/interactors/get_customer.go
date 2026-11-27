package interactors

import (
	"context"

	"example.com/shop/internal/modules/customers/application/ports/input"
	"example.com/shop/internal/modules/customers/application/ports/output"
)

type GetCustomer struct{ repo output.CustomerRepository }

var _ input.GetCustomer = (*GetCustomer)(nil)

func NewGetCustomer(repo output.CustomerRepository) *GetCustomer { return &GetCustomer{repo: repo} }

func (uc *GetCustomer) Execute(ctx context.Context, customerID string) (*input.CustomerView, error) {
	c, err := uc.repo.FindByID(ctx, customerID)
	if err != nil || c == nil {
		return nil, err
	}
	return &input.CustomerView{ID: c.ID(), Name: c.Name(), Email: c.Email()}, nil
}
