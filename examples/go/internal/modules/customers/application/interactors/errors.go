package interactors

import "fmt"

// EmailAlreadyRegisteredError: another customer already uses this email. Part of CustomerRepository.Save's contract.
type EmailAlreadyRegisteredError struct{ Email string }

func (e *EmailAlreadyRegisteredError) Error() string {
	return fmt.Sprintf("Email %s is already registered", e.Email)
}
