package controllers

import (
	"context"
	"errors"
	"strings"
	"testing"

	"example.com/shop/internal/modules/orders/application/interactors"
)

type capture struct{ req interactors.PlaceOrderRequest }

func (c *capture) Execute(_ context.Context, req interactors.PlaceOrderRequest) error {
	c.req = req
	return nil
}

func TestTranslatesItemsIntoLinesAndCoercesBadNumbers(t *testing.T) {
	uc := &capture{}
	body := `{"customerId":"c-1","items":[{"productId":"p1","quantity":2,"unitPriceCents":250},{"quantity":"two"}]}`
	if err := NewPlaceOrder(uc).Handle(context.Background(), strings.NewReader(body)); err != nil {
		t.Fatal(err)
	}
	if len(uc.req.Lines) != 2 || uc.req.Lines[0].Quantity != 2 || uc.req.Lines[1].Quantity != -1 {
		t.Fatalf("got %+v", uc.req)
	}
}

func TestMalformedJSONIsReportedAsSuch(t *testing.T) {
	var malformed ErrMalformedJSON
	if err := NewPlaceOrder(&capture{}).Handle(context.Background(), strings.NewReader("{")); !errors.As(err, &malformed) {
		t.Fatalf("got %v", err)
	}
}
