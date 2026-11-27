package presenters

import (
	"errors"
	"strings"
	"testing"

	"example.com/shop/internal/modules/orders/application/interactors"
	"example.com/shop/internal/modules/orders/application/ports/output"
	"example.com/shop/internal/modules/orders/domain"
)

// translate looks the key up in the module's own catalog, falling back to the key like platform/i18n does. A test
// of this package may not import platform/i18n (infrastructure never depends on platform).
func translate(locale, key string, params map[string]string) string {
	text, ok := Messages[locale][key]
	if !ok {
		return key
	}
	for name, value := range params {
		text = strings.ReplaceAll(text, "{"+name+"}", value)
	}
	return text
}

func TestPresentFormatsTheResult(t *testing.T) {
	p := NewPlaceOrder(translate, "en")
	p.Present(output.PlaceOrderResult{OrderID: "o-1", Status: "PENDING", TotalCents: 123456})
	if *p.ViewModel != (ViewModel{OrderID: "o-1", StatusLabel: "Pending", Total: "$1,234.56"}) || p.HasError() {
		t.Fatalf("got %+v", p.ViewModel)
	}
}

func TestTheStatusIsInTheRequestLanguageAndTheAmountStaysInDollars(t *testing.T) {
	p := NewPlaceOrder(translate, "es")
	p.Present(output.PlaceOrderResult{OrderID: "o-1", Status: "PENDING", TotalCents: 123456})
	if *p.ViewModel != (ViewModel{OrderID: "o-1", StatusLabel: "Pendiente", Total: "$1,234.56"}) {
		t.Fatalf("got %+v", p.ViewModel)
	}
}

func TestAnUnknownStatusStaysReadable(t *testing.T) {
	p := NewPlaceOrder(translate, "en")
	p.Present(output.PlaceOrderResult{Status: "SHIPPED"})
	if p.ViewModel.StatusLabel != "SHIPPED" || p.ViewModel.Total != "$0.00" {
		t.Fatalf("got %+v", p.ViewModel)
	}
}

func TestTypedErrorsMapToCodesAndATextForTheLocaleAndTheRestIsHidden(t *testing.T) {
	noLines := &domain.InvalidOrderError{Reason: domain.ReasonNoLines, Detail: "log text"}
	cases := []struct {
		locale  string
		err     error
		code    ErrorCode
		message string
	}{
		{"en", &interactors.CustomerNotFoundError{CustomerID: "c-9"}, CustomerNotFound, "Customer c-9 not found"},
		{"es", &interactors.CustomerNotFoundError{CustomerID: "c-9"}, CustomerNotFound, "No existe el cliente c-9"},
		{"en", noLines, InvalidOrder, "Order must have at least one line"},
		{"es", noLines, InvalidOrder, "El pedido debe tener al menos una línea"},
		{"en", errors.New("no such table: orders"), UnknownError, "Unexpected error"},
	}
	for _, tc := range cases {
		p := NewPlaceOrder(translate, tc.locale)
		p.PresentError(tc.err)
		if *p.ErrorViewModel != (ErrorViewModel{Code: tc.code, Message: tc.message}) {
			t.Fatalf("%s %v: got %+v", tc.locale, tc.err, p.ErrorViewModel)
		}
	}
}
