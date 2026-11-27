// Package input is the PUBLIC SURFACE of the customers module: the only package
// another module's infrastructure may import.
package input

type CustomerView struct {
	ID   string
	Name string
}

type GetCustomer interface {
	Execute(id string) (*CustomerView, error)
}
