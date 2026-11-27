# Boundaries — Go

The input and output ports of a use case, and the boundary between two modules, are shown in the `usecase` and `gateway` references. This page shows a full boundary to an external system and a partial boundary. In Go the interface is declared by the package that uses it; the implementation satisfies it implicitly and asserts it with `var _ Port = (*Impl)(nil)`.

## Full boundary to an external system

```go
// internal/modules/billing/application/ports/output/payment_gateway.go
package output

import "context"

type ChargeRequest struct {
	InvoiceID   string
	AmountCents int64
	Currency    string
}

type ChargeResult struct {
	Paid      bool
	Reference string // the provider's reference when paid
	Reason    string // why it was declined
}

type PaymentGateway interface {
	Charge(ctx context.Context, req ChargeRequest) (ChargeResult, error)
}
```

```go
// internal/modules/billing/infrastructure/gateways/http_payment_gateway.go
// Talks to the payment provider's HTTP API. The *http.Client and the base URL are created in
// internal/platform/external and injected by bootstrap.
package gateways

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"example.com/shop/internal/modules/billing/application/ports/output"
)

type HTTPPaymentGateway struct {
	client  *http.Client
	baseURL string
}

var _ output.PaymentGateway = (*HTTPPaymentGateway)(nil)

func NewHTTPPaymentGateway(client *http.Client, baseURL string) *HTTPPaymentGateway {
	return &HTTPPaymentGateway{client: client, baseURL: baseURL}
}

func (g *HTTPPaymentGateway) Charge(ctx context.Context, req output.ChargeRequest) (output.ChargeResult, error) {
	body, _ := json.Marshal(map[string]any{"amount": req.AmountCents, "currency": req.Currency, "reference": req.InvoiceID})
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, g.baseURL+"/charges", bytes.NewReader(body))
	if err != nil {
		return output.ChargeResult{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	res, err := g.client.Do(httpReq)
	if err != nil {
		return output.ChargeResult{}, err
	}
	defer res.Body.Close()

	var answer struct {
		ID     string `json:"id"`
		Reason string `json:"decline_reason"`
	}
	switch res.StatusCode {
	case http.StatusOK, http.StatusCreated:
		err = json.NewDecoder(res.Body).Decode(&answer)
		return output.ChargeResult{Paid: true, Reference: answer.ID}, err
	case http.StatusPaymentRequired: // a declined card is a business outcome in billing's vocabulary
		_ = json.NewDecoder(res.Body).Decode(&answer)
		return output.ChargeResult{Reason: answer.Reason}, nil
	default:
		return output.ChargeResult{}, fmt.Errorf("payment provider answered %d", res.StatusCode)
	}
}
```

## Partial boundary — the interface now, the separation later

```go
// internal/modules/billing/application/ports/output/tax_calculator.go
package output

// TaxCalculator is a partial boundary: it may become a separate module (or service) when tax rules grow.
type TaxCalculator interface {
	TaxCents(amountCents int64, country string) int64
}
```

```go
// internal/modules/billing/infrastructure/gateways/flat_rate_tax_calculator.go
package gateways

import "example.com/shop/internal/modules/billing/application/ports/output"

var rates = map[string]float64{"AR": 0.21, "ES": 0.21, "US": 0}

type FlatRateTaxCalculator struct{}

var _ output.TaxCalculator = FlatRateTaxCalculator{}

func (FlatRateTaxCalculator) TaxCents(amountCents int64, country string) int64 {
	return int64(float64(amountCents)*rates[country] + 0.5)
}
```
