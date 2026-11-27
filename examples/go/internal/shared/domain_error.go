// Package shared is the shared kernel: imported by every module's domain, it imports nothing from the project.
package shared

import "errors"

// ErrBusinessRule is the common base of the errors that mean "a business rule was violated". Each module
// wraps it in its own error (ErrInvalidOrder, ErrInvalidCustomer), so outer layers can match the base
// (errors.Is(err, shared.ErrBusinessRule)) or the specific one.
var ErrBusinessRule = errors.New("business rule violated")
