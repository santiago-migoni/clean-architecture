// Package controllers turns HTTP requests into use case calls and their results into HTTP answers.
// Default style (no Output Port): each controller maps the response model itself.
package controllers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"example.com/shop/internal/modules/customers/application/interactors"
	"example.com/shop/internal/modules/customers/application/ports/input"
	"example.com/shop/internal/modules/customers/domain"
)

// RegisterCustomerUseCase is what the controller needs; *interactors.RegisterCustomer satisfies it.
type RegisterCustomerUseCase interface {
	Execute(ctx context.Context, req interactors.RegisterCustomerRequest) (interactors.RegisterCustomerResponse, error)
}

// registerCustomerHTTPRequest is the body exactly as it arrives.
type registerCustomerHTTPRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

type RegisterCustomer struct{ useCase RegisterCustomerUseCase }

func NewRegisterCustomer(useCase RegisterCustomerUseCase) *RegisterCustomer {
	return &RegisterCustomer{useCase: useCase}
}

func (c *RegisterCustomer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var body registerCustomerHTTPRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteJSON(w, http.StatusBadRequest, map[string]string{"message": "Malformed JSON"})
		return
	}
	res, err := c.useCase.Execute(r.Context(), interactors.RegisterCustomerRequest{Name: body.Name, Email: body.Email})
	var conflict *interactors.EmailAlreadyRegisteredError
	switch {
	case err == nil:
		WriteJSON(w, http.StatusCreated, res)
	case errors.Is(err, domain.ErrInvalidCustomer):
		WriteJSON(w, http.StatusBadRequest, map[string]string{"message": message(err)})
	case errors.As(err, &conflict):
		WriteJSON(w, http.StatusConflict, map[string]string{"message": err.Error()})
	default:
		panic(err) // unexpected: the recovery middleware in platform/web logs it and answers 500
	}
}

// GetCustomer depends on the Input Port, because other modules also call this use case.
type GetCustomer struct{ useCase input.GetCustomer }

func NewGetCustomer(useCase input.GetCustomer) *GetCustomer { return &GetCustomer{useCase: useCase} }

func (c *GetCustomer) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	view, err := c.useCase.Execute(r.Context(), id)
	switch {
	case err != nil:
		panic(err)
	case view == nil:
		WriteJSON(w, http.StatusNotFound, map[string]string{"message": "Customer " + id + " not found"})
	default:
		WriteJSON(w, http.StatusOK, view)
	}
}

// message drops the wrapping prefix ("invalid customer: business rule violated: ") from a domain error.
func message(err error) string {
	for unwrapped := errors.Unwrap(err); unwrapped != nil; unwrapped = errors.Unwrap(unwrapped) {
		if s, prefix := err.Error(), unwrapped.Error()+": "; len(s) > len(prefix) && s[:len(prefix)] == prefix {
			return s[len(prefix):]
		}
	}
	return err.Error()
}

func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
