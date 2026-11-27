// Package input is the PUBLIC SURFACE of the customers module: the only package another module's
// infrastructure may import. Plain data only — no domain objects cross this boundary.
package input

import "context"

type CustomerView struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type GetCustomer interface {
	Execute(ctx context.Context, customerID string) (*CustomerView, error) // nil, nil when absent
}
