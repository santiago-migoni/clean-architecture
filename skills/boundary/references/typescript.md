# Boundaries — TypeScript / JavaScript

The input and output ports of a use case, and the boundary between two modules, are shown in the `usecase` and `gateway` references. This page shows a full boundary to an external system and a partial boundary.

## Full boundary to an external system

The inner layer declares what it needs, in its own vocabulary; an adapter in `infrastructure/` translates to the provider's API. The provider's client is created in `platform/external/` and injected by `main/`.

```typescript
// src/modules/billing/application/ports/output/payment-gateway.ts
export interface ChargeRequest { invoiceId: string; amountCents: number; currency: string }
export type ChargeResult = { status: 'paid'; reference: string } | { status: 'declined'; reason: string };

export interface IPaymentGateway {
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
```

```typescript
// src/modules/billing/infrastructure/gateways/stripe-payment-gateway.ts
import type Stripe from 'stripe'; // the SDK is allowed here, never in application/ or domain/
import { ChargeRequest, ChargeResult, IPaymentGateway } from '../../application/ports/output/payment-gateway';

export class StripePaymentGateway implements IPaymentGateway {
  constructor(private readonly stripe: Stripe) {} // created in platform/external, injected by main/

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: request.amountCents,
        currency: request.currency.toLowerCase(),
        metadata: { invoiceId: request.invoiceId },
        confirm: true,
      });
      return { status: 'paid', reference: intent.id };
    } catch (error) {
      // A declined card is a business outcome in billing's vocabulary; anything else propagates.
      if ((error as { type?: string }).type === 'StripeCardError') return { status: 'declined', reason: (error as Error).message };
      throw error;
    }
  }
}
```

## Partial boundary — the interface now, the separation later

One interface and one implementation in the same module, marked so the next team knows it can be split into its own module or deployable without touching the callers.

```typescript
// src/modules/billing/application/ports/output/tax-calculator.ts
/** Partial boundary: may become a separate module (or service) when tax rules grow. */
export interface ITaxCalculator {
  taxCents(amountCents: number, country: string): number;
}

// src/modules/billing/infrastructure/gateways/flat-rate-tax-calculator.ts
const RATES: Record<string, number> = { AR: 0.21, ES: 0.21, US: 0 };

export class FlatRateTaxCalculator implements ITaxCalculator {
  taxCents(amountCents: number, country: string): number {
    return Math.round(amountCents * (RATES[country] ?? 0));
  }
}
```
