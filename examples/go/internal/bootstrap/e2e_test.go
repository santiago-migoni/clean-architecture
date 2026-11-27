package bootstrap

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	customersinput "example.com/shop/internal/modules/customers/application/ports/input"
	ordersinmemory "example.com/shop/internal/modules/orders/infrastructure/gateways/inmemory"
)

// The same HTTP scenarios against the PRODUCTION composition root (SQLite) and the TEST one (in-memory).
func roots(t *testing.T) map[string]http.Handler {
	production, conn, err := New(Config{DatabaseDSN: ":memory:", AuditLog: func(string) {}})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close() })
	return map[string]http.Handler{"production": production, "in-memory": NewForTest().Handler}
}

func call(h http.Handler, method, path, body string) (int, map[string]any) {
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func TestHTTP(t *testing.T) {
	for name, h := range roots(t) {
		t.Run(name, func(t *testing.T) {
			status, created := call(h, "POST", "/customers", `{"name":"Ada","email":"ADA@example.com"}`)
			id, _ := created["customerId"].(string)
			if status != 201 || id == "" {
				t.Fatalf("register: %d %v", status, created)
			}
			if status, found := call(h, "GET", "/customers/"+id, ""); status != 200 || found["email"] != "ada@example.com" {
				t.Fatalf("get: %d %v", status, found)
			}
			if status, _ := call(h, "GET", "/customers/ghost", ""); status != 404 {
				t.Fatalf("unknown customer: %d", status)
			}
			if status, body := call(h, "POST", "/customers", `{"name":"Other","email":"ada@example.com"}`); status != 409 || body["message"] != "Email ada@example.com is already registered" {
				t.Fatalf("duplicate email: %d %v", status, body)
			}
			if status, _ := call(h, "GET", "/customers/"+id, ""); status != 200 {
				t.Fatal("the first customer did not survive the duplicate")
			}
			if status, body := call(h, "POST", "/customers", `{"name":"Ada","email":"nope"}`); status != 400 || body["message"] != "Customer email is not valid" {
				t.Fatalf("invalid customer: %d %v", status, body)
			}
			items := `[{"productId":"p1","quantity":3,"unitPriceCents":250},{"productId":"p2","quantity":1,"unitPriceCents":1000}]`
			if status, body := call(h, "POST", "/orders", `{"customerId":"`+id+`","items":`+items+`}`); status != 201 || body["statusLabel"] != "Pending" || body["total"] != "$17.50" {
				t.Fatalf("place order: %d %v", status, body)
			}
			if status, body := call(h, "POST", "/orders", `{"customerId":"ghost","items":`+items+`}`); status != 404 || body["code"] != "CUSTOMER_NOT_FOUND" {
				t.Fatalf("unknown customer order: %d %v", status, body)
			}
			if status, body := call(h, "POST", "/orders", `{"customerId":"`+id+`","items":[]}`); status != 400 || body["code"] != "INVALID_ORDER" {
				t.Fatalf("invalid order: %d %v", status, body)
			}
			if status, body := call(h, "POST", "/orders", `{`); status != 400 || body["message"] != "Malformed JSON" {
				t.Fatalf("malformed JSON: %d %v", status, body)
			}
		})
	}
}

func TestOrderPlacedIsPublishedOnceAndOnlyForPlacedOrders(t *testing.T) {
	app := NewForTest()
	_, created := call(app.Handler, "POST", "/customers", `{"name":"Ada","email":"ada@example.com"}`)
	call(app.Handler, "POST", "/orders", `{"customerId":"ghost","items":[{"productId":"p","quantity":1,"unitPriceCents":1}]}`)
	call(app.Handler, "POST", "/orders", `{"customerId":"`+created["customerId"].(string)+`","items":[{"productId":"p","quantity":1,"unitPriceCents":1}]}`)
	if len(app.Events.Published) != 1 || app.Orders.Count() != 1 {
		t.Fatalf("published %d events for %d orders", len(app.Events.Published), app.Orders.Count())
	}
}

// Presenters hold the view model, so composeOrders must build a NEW one per call. Tested on the factory
// itself: requests over this synchronous stack never interleave, so a concurrency test could not see sharing.
func TestEachRequestGetsItsOwnPresenter(t *testing.T) {
	make := composeOrders(ordersinmemory.NewOrderRepository(), &ordersinmemory.RecordingOrderEvents{}, func() string { return "o-1" }, noCustomers{})
	a, b := make(), make()
	if a.Presenter == b.Presenter {
		t.Fatal("two requests share a presenter")
	}
	_ = a.Controller.Handle(t.Context(), bytes.NewBufferString(`{"customerId":"ghost","items":[{"productId":"p","quantity":1,"unitPriceCents":1}]}`))
	if !a.Presenter.HasError() || b.Presenter.HasError() || b.Presenter.ViewModel != nil {
		t.Fatal("the state of one request leaked into the other")
	}
}

type noCustomers struct{}

func (noCustomers) Execute(context.Context, string) (*customersinput.CustomerView, error) {
	return nil, nil
}
