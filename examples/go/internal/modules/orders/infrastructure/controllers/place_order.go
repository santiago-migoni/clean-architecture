// Package controllers turns HTTP requests into orders use case calls. PlaceOrder has an Output Port, so this
// controller never writes the answer: the presenter prepares it and the route in platform/web sends it.
package controllers

import (
	"context"
	"encoding/json"
	"io"

	"example.com/shop/internal/modules/orders/application/interactors"
)

type PlaceOrderUseCase interface {
	Execute(ctx context.Context, req interactors.PlaceOrderRequest) error
}

// placeOrderHTTPRequest is the body exactly as it arrives (HTTP vocabulary: items, not lines).
type placeOrderHTTPRequest struct {
	CustomerID string `json:"customerId"`
	Items      []struct {
		ProductID      string          `json:"productId"`
		Quantity       json.RawMessage `json:"quantity"`
		UnitPriceCents json.RawMessage `json:"unitPriceCents"`
	} `json:"items"`
}

// ErrMalformedJSON is returned for a body that is not JSON: a client error, answered by the route.
type ErrMalformedJSON struct{ Err error }

func (e ErrMalformedJSON) Error() string { return "Malformed JSON" }

type PlaceOrder struct{ useCase PlaceOrderUseCase }

func NewPlaceOrder(useCase PlaceOrderUseCase) *PlaceOrder { return &PlaceOrder{useCase: useCase} }

func (c *PlaceOrder) Handle(ctx context.Context, body io.Reader) error {
	var in placeOrderHTTPRequest
	if err := json.NewDecoder(body).Decode(&in); err != nil {
		return ErrMalformedJSON{Err: err}
	}
	req := interactors.PlaceOrderRequest{CustomerID: in.CustomerID}
	for _, i := range in.Items {
		req.Lines = append(req.Lines, interactors.PlaceOrderLine{ProductID: i.ProductID, Quantity: whole(i.Quantity), UnitPriceCents: whole(i.UnitPriceCents)})
	}
	return c.useCase.Execute(ctx, req)
}

// whole coerces a JSON number to an int; anything else becomes -1, which the entity rejects.
func whole(raw json.RawMessage) int {
	var n int
	if err := json.Unmarshal(raw, &n); err != nil {
		return -1
	}
	return n
}
