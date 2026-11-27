// Package controllers turns HTTP requests into use case calls and their results into HTTP answers.
// Default style (no Output Port): each controller maps the response model itself, in the request's language.
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

// errorBody is every failure answer: a stable code for programs, a text in the request's language for people.
type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type RegisterCustomer struct {
	useCase RegisterCustomerUseCase
	t       Translate
}

func NewRegisterCustomer(useCase RegisterCustomerUseCase, t Translate) *RegisterCustomer {
	return &RegisterCustomer{useCase: useCase, t: t}
}

// Handle answers the request in locale, which platform/web negotiated from Accept-Language.
func (c *RegisterCustomer) Handle(w http.ResponseWriter, r *http.Request, locale string) {
	var body registerCustomerHTTPRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		WriteJSON(w, http.StatusBadRequest, errorBody{"MALFORMED_JSON", c.t(locale, "MALFORMED_JSON", nil)})
		return
	}
	res, err := c.useCase.Execute(r.Context(), interactors.RegisterCustomerRequest{Name: body.Name, Email: body.Email})
	var invalid *domain.InvalidCustomerError
	var conflict *interactors.EmailAlreadyRegisteredError
	// By the error's type and reason, never by its message (which is for logs).
	switch {
	case err == nil:
		WriteJSON(w, http.StatusCreated, res)
	case errors.As(err, &invalid):
		WriteJSON(w, http.StatusBadRequest, errorBody{"INVALID_CUSTOMER", c.t(locale, "INVALID_CUSTOMER."+string(invalid.Reason), nil)})
	case errors.As(err, &conflict):
		message := c.t(locale, "EMAIL_ALREADY_REGISTERED", map[string]string{"email": conflict.Email})
		WriteJSON(w, http.StatusConflict, errorBody{"EMAIL_ALREADY_REGISTERED", message})
	default:
		panic(err) // unexpected: the recovery middleware in platform/web logs it and answers 500
	}
}

// GetCustomer depends on the Input Port, because other modules also call this use case.
type GetCustomer struct {
	useCase input.GetCustomer
	t       Translate
}

func NewGetCustomer(useCase input.GetCustomer, t Translate) *GetCustomer {
	return &GetCustomer{useCase: useCase, t: t}
}

func (c *GetCustomer) Handle(w http.ResponseWriter, r *http.Request, locale string) {
	id := r.PathValue("id")
	view, err := c.useCase.Execute(r.Context(), id)
	switch {
	case err != nil:
		panic(err)
	case view == nil:
		message := c.t(locale, "CUSTOMER_NOT_FOUND", map[string]string{"customerId": id})
		WriteJSON(w, http.StatusNotFound, errorBody{"CUSTOMER_NOT_FOUND", message})
	default:
		WriteJSON(w, http.StatusOK, view)
	}
}

func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
