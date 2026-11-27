// Package web is the delivery mechanism: routes, the locale of each request, the humble view of PlaceOrder, and the
// last-resort handler. It receives ready-made controllers and factories from bootstrap; it never builds a use case.
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
	"example.com/shop/internal/platform/i18n"
)

// PlaceOrderPair is what the factory returns for each request: a NEW presenter and the controller bound to it.
type PlaceOrderPair struct {
	Presenter  *orderspresenters.PlaceOrder
	Controller interface {
		Handle(ctx context.Context, body io.Reader) error
	}
}

// LocalizedHandler answers a request in the locale negotiated here: reading Accept-Language is an HTTP detail.
type LocalizedHandler interface {
	Handle(w http.ResponseWriter, r *http.Request, locale string)
}

type Handlers struct {
	RegisterCustomer LocalizedHandler
	GetCustomer      LocalizedHandler
	MakePlaceOrder   func(locale string) PlaceOrderPair
}

// errorBody is every failure answer: a stable code for programs, a text in the request's language for people.
type errorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Delivery detail: which HTTP status each presenter error code gets.
var statusByCode = map[orderspresenters.ErrorCode]int{
	orderspresenters.CustomerNotFound: http.StatusNotFound,
	orderspresenters.InvalidOrder:     http.StatusBadRequest,
	orderspresenters.UnknownError:     http.StatusInternalServerError,
}

// NewHandler builds the routes. locales[0] is the default: the answer when the client asks for nothing the app speaks.
func NewHandler(h Handlers, locales []string) http.Handler {
	s := server{t: i18n.New(Messages, locales[0]), locales: locales}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /customers", s.localized(h.RegisterCustomer))
	mux.HandleFunc("GET /customers/{id}", s.localized(h.GetCustomer))
	mux.HandleFunc("POST /orders", s.placeOrder(h.MakePlaceOrder))
	return s.recoverUnexpected(mux)
}

type server struct {
	t       func(locale, key string, params map[string]string) string
	locales []string
}

func (s server) localeOf(r *http.Request) string {
	return NegotiateLocale(r.Header.Get("Accept-Language"), s.locales)
}

func (s server) localized(h LocalizedHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { h.Handle(w, r, s.localeOf(r)) }
}

// placeOrder is the HUMBLE view: run the controller, then send what the presenter prepared.
func (s server) placeOrder(make func(locale string) PlaceOrderPair) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		locale := s.localeOf(r)
		pair := make(locale)
		err := pair.Controller.Handle(r.Context(), r.Body)
		var malformed orderscontrollers.ErrMalformedJSON
		switch {
		case errors.As(err, &malformed):
			writeJSON(w, http.StatusBadRequest, errorBody{"MALFORMED_JSON", s.t(locale, "MALFORMED_JSON", nil)})
		case err != nil:
			panic(err)
		case pair.Presenter.HasError():
			writeJSON(w, statusByCode[pair.Presenter.ErrorViewModel.Code], pair.Presenter.ErrorViewModel)
		default:
			writeJSON(w, http.StatusCreated, pair.Presenter.ViewModel)
		}
	}
}

func (s server) recoverUnexpected(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				log.Printf("unhandled error: %v", v) // log it, never send it
				writeJSON(w, http.StatusInternalServerError, errorBody{"UNKNOWN_ERROR", s.t(s.localeOf(r), "UNKNOWN_ERROR", nil)})
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
