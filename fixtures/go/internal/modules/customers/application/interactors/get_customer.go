// Package interactors implements the customers use cases.
package interactors

import (
	"example.com/shop/internal/modules/customers/application/ports/input"
	"example.com/shop/internal/modules/customers/application/ports/output"
)

type GetCustomer struct{ repo output.CustomerRepository }

var _ input.GetCustomer = (*GetCustomer)(nil)

func NewGetCustomer(repo output.CustomerRepository) *GetCustomer { return &GetCustomer{repo: repo} }

func (uc *GetCustomer) Execute(id string) (*input.CustomerView, error) {
	c, err := uc.repo.FindByID(id)
	if err != nil || c == nil {
		return nil, err
	}
	return &input.CustomerView{ID: c.ID, Name: c.Name}, nil
}
