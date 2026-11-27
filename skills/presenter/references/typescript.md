# Presenter — TypeScript / JavaScript

Files: `src/modules/<module>/infrastructure/presenters/<name>-presenter.ts` with `<name>-view-model.ts` beside it; the humble route handler in `src/platform/web/<name>-route.ts`. The examples are the real files of `examples/typescript` (Express 5).

## View model

```typescript
// src/modules/orders/infrastructure/presenters/place-order-view-model.ts
// Plain data — no methods, no logic. Formatted for the view / HTTP response.
export interface PlaceOrderViewModel {
  orderId: string;
  statusLabel: string; // 'Pending' (or 'Pendiente') instead of 'PENDING'
  total: string;       // '$25.00' instead of 2500 (cents)
}

// One code per typed error the use case reports, plus the fallback. A string-literal union lets the
// compiler check the presenter's mapping and the route's status table.
export type PlaceOrderErrorCode = 'CUSTOMER_NOT_FOUND' | 'INVALID_ORDER' | 'UNKNOWN_ERROR';

export interface PlaceOrderErrorViewModel {
  message: string; // in the request's language
  code: PlaceOrderErrorCode;
}
```

## Presenter — the testable half

The use case returns codes (a status, a failure reason); the presenter writes them for the request's locale. The
texts are the module's own, in a catalog beside the presenter; the translator is injected by `main/` (its
implementation lives in `platform/i18n/`, which a module never imports).

```typescript
// src/modules/orders/infrastructure/presenters/place-order-messages.ts
export const placeOrderMessages = {
  en: {
    'STATUS.PENDING': 'Pending',
    CUSTOMER_NOT_FOUND: 'Customer {customerId} not found',
    'INVALID_ORDER.NO_LINES': 'Order must have at least one line',
    UNKNOWN_ERROR: 'Unexpected error',
  },
  es: {
    'STATUS.PENDING': 'Pendiente',
    CUSTOMER_NOT_FOUND: 'No existe el cliente {customerId}',
    'INVALID_ORDER.NO_LINES': 'El pedido debe tener al menos una línea',
    UNKNOWN_ERROR: 'Error inesperado',
  },
};

export type Translate = (locale: string, key: string, params?: Readonly<Record<string, string>>) => string;
```

```typescript
// src/modules/orders/infrastructure/presenters/place-order-presenter.ts
// May import this module's application/ and domain/ and shared/; never platform/, main/, HTTP libraries or other modules.
import { IPlaceOrderOutputPort, PlaceOrderResponse } from '../../application/ports/output/place-order-output';
import { CustomerNotFoundError } from '../../application/errors/customer-not-found-error';
import { InvalidOrderError } from '../../domain/errors/invalid-order-error';
import type { Translate } from './place-order-messages';
import { PlaceOrderErrorCode, PlaceOrderErrorViewModel, PlaceOrderViewModel } from './place-order-view-model';

// The amount is in US dollars whatever the language: the currency is a fact of the order, not of the reader.
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export class PlaceOrderPresenter implements IPlaceOrderOutputPort {
  private _viewModel: PlaceOrderViewModel | null = null;
  private _errorViewModel: PlaceOrderErrorViewModel | null = null;

  // One presenter per request: the locale is the request's.
  constructor(private readonly t: Translate, private readonly locale: string) {}

  present(response: PlaceOrderResponse): void {
    const key = `STATUS.${response.status}`;
    const label = this.t(this.locale, key);
    this._viewModel = {
      orderId: response.orderId,
      statusLabel: label === key ? response.status : label, // an unknown status stays readable
      total: usd.format(response.totalCents / 100),
    };
  }

  presentError(error: Error): void {
    // By type and reason, never by message text. Never leak the message of an unexpected failure.
    if (error instanceof CustomerNotFoundError) {
      this.fail('CUSTOMER_NOT_FOUND', this.t(this.locale, 'CUSTOMER_NOT_FOUND', { customerId: error.customerId }));
    } else if (error instanceof InvalidOrderError) {
      this.fail('INVALID_ORDER', this.t(this.locale, `INVALID_ORDER.${error.reason}`));
    } else {
      this.fail('UNKNOWN_ERROR', this.t(this.locale, 'UNKNOWN_ERROR'));
    }
  }

  get viewModel(): PlaceOrderViewModel | null { return this._viewModel; }
  get errorViewModel(): PlaceOrderErrorViewModel | null { return this._errorViewModel; }
  get hasError(): boolean { return this._errorViewModel !== null; }

  private fail(code: PlaceOrderErrorCode, message: string): void {
    this._errorViewModel = { code, message };
  }
}
```

## The view — the humble half, in platform/web

```typescript
// src/platform/web/place-order-route.ts
// As thin as possible: reads what the presenter prepared and sends it. main/ builds a NEW presenter +
// controller pair per request (presenters are stateful), in the request's locale, and injects the factory.
import type { Request, Response } from 'express';
import type { PlaceOrderController } from '../../modules/orders/infrastructure/controllers/place-order-controller';
import type { PlaceOrderPresenter } from '../../modules/orders/infrastructure/presenters/place-order-presenter';

export interface PlaceOrderPair { presenter: PlaceOrderPresenter; controller: PlaceOrderController }

// Delivery detail: which HTTP status each presenter error code gets.
const STATUS_BY_CODE = { CUSTOMER_NOT_FOUND: 404, INVALID_ORDER: 400, UNKNOWN_ERROR: 500 } as const;

export function placeOrderHandler(make: (locale: string) => PlaceOrderPair, localeOf: (req: Request) => string) {
  return async (req: Request, res: Response): Promise<void> => {
    const { presenter, controller } = make(localeOf(req)); // localeOf: Accept-Language, negotiated in platform/web
    await controller.handle(req);
    if (presenter.hasError) res.status(STATUS_BY_CODE[presenter.errorViewModel!.code]).json(presenter.errorViewModel);
    else res.status(201).json(presenter.viewModel);
  };
}
```

## Test — no HTTP stack

```typescript
// tests/orders/unit/infrastructure/presenters/place-order-presenter.test.ts
import { describe, expect, it } from 'vitest';
import { PlaceOrderPresenter } from '@/modules/orders/infrastructure/presenters/place-order-presenter';
import { placeOrderMessages } from '@/modules/orders/infrastructure/presenters/place-order-messages';
import { CustomerNotFoundError } from '@/modules/orders/application/errors/customer-not-found-error';
import { createTranslator } from '@/platform/i18n/translator';

const presenter = (locale = 'en') => new PlaceOrderPresenter(createTranslator(placeOrderMessages, 'en'), locale);

describe('PlaceOrderPresenter', () => {
  it('formats the response model into a view model, in the request language', () => {
    const p = presenter('es');
    p.present({ orderId: 'o-1', status: 'PENDING', totalCents: 123456 });
    expect(p.viewModel).toEqual({ orderId: 'o-1', statusLabel: 'Pendiente', total: '$1,234.56' });
  });

  it('maps a typed error to its code and a text for the locale', () => {
    const p = presenter('en');
    p.presentError(new CustomerNotFoundError('c-9'));
    expect(p.errorViewModel).toEqual({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer c-9 not found' });
  });

  it('never leaks the message of an unexpected failure', () => {
    const p = presenter('en');
    p.presentError(new Error('SQLITE_ERROR: no such table: orders'));
    expect(p.errorViewModel).toEqual({ code: 'UNKNOWN_ERROR', message: 'Unexpected error' });
  });
});
```
