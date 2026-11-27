// Package output declares what the customers use cases need from the outside.
package output

import "example.com/shop/internal/modules/customers/domain"

type CustomerRepository interface {
	FindByID(id string) (*domain.Customer, error)
}
