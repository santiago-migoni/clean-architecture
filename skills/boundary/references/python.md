# Boundaries — Python

The input and output ports of a use case, and the boundary between two modules, are shown in the `usecase` and `gateway` references. This page shows a full boundary to an external system and a partial boundary.

## Full boundary to an external system

The inner layer declares what it needs, in its own vocabulary; an adapter in `infrastructure/` translates to the provider's API. The provider's client is created in `platform/external/` and injected by `main`.

```python
# src/shop/modules/billing/application/ports/output/payment_gateway.py
from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True)
class ChargeRequest:
    invoice_id: str
    amount_cents: int
    currency: str


@dataclass(frozen=True)
class ChargeResult:
    status: Literal["paid", "declined"]
    detail: str  # the provider's reference when paid, the reason when declined


class PaymentGateway(Protocol):
    def charge(self, request: ChargeRequest) -> ChargeResult: ...
```

```python
# src/shop/modules/billing/infrastructure/gateways/stripe_payment_gateway.py
import stripe  # the SDK is allowed here, never in application/ or domain/

from ...application.ports.output.payment_gateway import ChargeRequest, ChargeResult


class StripePaymentGateway:
    def __init__(self, client: stripe.StripeClient) -> None:  # created in platform/external, injected by main
        self._client = client

    def charge(self, request: ChargeRequest) -> ChargeResult:
        try:
            intent = self._client.payment_intents.create(
                params={
                    "amount": request.amount_cents,
                    "currency": request.currency.lower(),
                    "metadata": {"invoice_id": request.invoice_id},
                    "confirm": True,
                }
            )
        except stripe.CardError as error:
            # A declined card is a business outcome in billing's vocabulary; anything else propagates.
            return ChargeResult("declined", error.user_message or "declined")
        return ChargeResult("paid", intent.id)
```

## Partial boundary — the interface now, the separation later

```python
# src/shop/modules/billing/application/ports/output/tax_calculator.py
from typing import Protocol


class TaxCalculator(Protocol):
    """Partial boundary: may become a separate module (or service) when tax rules grow."""

    def tax_cents(self, amount_cents: int, country: str) -> int: ...
```

```python
# src/shop/modules/billing/infrastructure/gateways/flat_rate_tax_calculator.py
RATES = {"AR": 0.21, "ES": 0.21, "US": 0.0}


class FlatRateTaxCalculator:
    def tax_cents(self, amount_cents: int, country: str) -> int:
        return round(amount_cents * RATES.get(country, 0.0))
```
