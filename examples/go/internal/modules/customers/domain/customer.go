// Package domain holds the customers module's enterprise business rules. It imports only internal/shared.
package domain

import (
	"regexp"
	"strings"
)

var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

type Customer struct {
	id    string
	name  string
	email string
}

// NewCustomer normalises the name and the email, then enforces the invariants.
func NewCustomer(id, name, email string) (*Customer, error) {
	return ReconstituteCustomer(id, strings.TrimSpace(name), strings.ToLower(strings.TrimSpace(email)))
}

// ReconstituteCustomer rebuilds a customer from persistence: the same invariants, no normalisation.
func ReconstituteCustomer(id, name, email string) (*Customer, error) {
	if name == "" {
		return nil, &InvalidCustomerError{Reason: ReasonNameRequired, Detail: "Customer name must not be empty"}
	}
	if !emailPattern.MatchString(email) {
		return nil, &InvalidCustomerError{Reason: ReasonInvalidEmail, Detail: "Customer email is not valid"}
	}
	return &Customer{id: id, name: name, email: email}, nil
}

func (c *Customer) ID() string    { return c.id }
func (c *Customer) Name() string  { return c.name }
func (c *Customer) Email() string { return c.email }
