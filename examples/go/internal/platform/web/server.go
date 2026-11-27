// Package web is the delivery mechanism: routes, the humble view of PlaceOrder, and the last-resort handler.
// It receives ready-made controllers and factories from bootstrap; it never builds a use case.
package web

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	orderscontrollers "example.com/shop/internal/modules/orders/infrastructure/controllers"
	orderspresenters "example.com/shop/internal/modules/orders/infrastructure/presenters"
)

// PlaceOrderPair is what the factory returns for each request: a NEW presenter and the controller bound to it.
type PlaceOrderPair struct {
	Presenter  *orderspresenters.PlaceOrder
	Controller interface {
		Handle(ctx context.Context, body io.Reader) error
	}
}

type Handlers struct {
	RegisterCustomer http.Handler
	GetCustomer      http.Handler
	MakePlaceOrder   func() PlaceOrderPair
}

// Delivery detail: which HTTP status each presenter error code gets.
var statusByCode = map[orderspresenters.ErrorCode]int{
	orderspresenters.CustomerNotFound: http.StatusNotFound,
	orderspresenters.InvalidOrder:     http.StatusBadRequest,
	orderspresenters.UnknownError:     http.StatusInternalServerError,
}

func NewHandler(h Handlers) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("POST /customers", h.RegisterCustomer)
	mux.Handle("GET /customers/{id}", h.GetCustomer)
	mux.HandleFunc("POST /orders", placeOrder(h.MakePlaceOrder))
	return recoverUnexpected(mux)
}

// placeOrder is the HUMBLE view: run the controller, then send what the presenter prepared.
func placeOrder(make func() PlaceOrderPair) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pair := make()
		err := pair.Controller.Handle(r.Context(), r.Body)
		var malformed orderscontrollers.ErrMalformedJSON
		switch {
		case errors.As(err, &malformed):
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "Malformed JSON"})
		case err != nil:
			panic(err)
		case pair.Presenter.HasError():
			writeJSON(w, statusByCode[pair.Presenter.ErrorViewModel.Code], pair.Presenter.ErrorViewModel)
		default:
			writeJSON(w, http.StatusCreated, pair.Presenter.ViewModel)
		}
	}
}

func recoverUnexpected(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				log.Printf("unhandled error: %v", v) // log it, never send it
				writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "Unexpected error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
