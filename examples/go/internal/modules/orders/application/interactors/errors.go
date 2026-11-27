package interactors

import "fmt"

// CustomerNotFoundError: an APPLICATION failure — the use case needs a customer that does not exist.
type CustomerNotFoundError struct{ CustomerID string }

func (e *CustomerNotFoundError) Error() string {
	return fmt.Sprintf("Customer %s not found", e.CustomerID)
}
