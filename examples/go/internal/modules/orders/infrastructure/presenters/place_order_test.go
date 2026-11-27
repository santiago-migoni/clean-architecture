package presenters

import (
	"errors"
	"fmt"
	"testing"

	"example.com/shop/internal/modules/orders/application/interactors"
	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/domain"
)

func TestPresentFormatsTheResult(t *testing.T) {
	p := &PlaceOrder{}
	p.Present(output.PlaceOrderResult{OrderID: "o-1", Status: "PENDING", TotalCents: 123456})
	if *p.ViewModel != (ViewModel{OrderID: "o-1", StatusLabel: "Pending", Total: "$1,234.56"}) || p.HasError() {
		t.Fatalf("got %+v", p.ViewModel)
	}
}

func TestAnUnknownStatusStaysReadable(t *testing.T) {
	p := &PlaceOrder{}
	p.Present(output.PlaceOrderResult{Status: "SHIPPED"})
	if p.ViewModel.StatusLabel != "SHIPPED" || p.ViewModel.Total != "$0.00" {
		t.Fatalf("got %+v", p.ViewModel)
	}
}

func TestTypedErrorsMapToCodesAndTheRestIsHidden(t *testing.T) {
	cases := []struct {
		err     error
		code    ErrorCode
		message string
	}{
		{&interactors.CustomerNotFoundError{CustomerID: "c-9"}, CustomerNotFound, "Customer c-9 not found"},
		{fmt.Errorf("%w: Order must have at least one line", domain.ErrInvalidOrder), InvalidOrder, "Order must have at least one line"},
		{errors.New("no such table: orders"), UnknownError, "Unexpected error"},
	}
	for _, tc := range cases {
		p := &PlaceOrder{}
		p.PresentError(tc.err)
		if *p.ErrorViewModel != (ErrorViewModel{Code: tc.code, Message: tc.message}) {
			t.Fatalf("%v: got %+v", tc.err, p.ErrorViewModel)
		}
	}
}
