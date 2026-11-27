# Presenter — TypeScript / JavaScript

Files: `src/modules/<module>/infrastructure/presenters/<name>-presenter.ts` with `<name>-view-model.ts` beside it; the humble route handler in `src/platform/web/<name>-route.ts`. The examples are the real files of `examples/typescript` (Express 5).

## View model

```typescript
// src/modules/orders/infrastructure/presenters/place-order-view-model.ts
// Plain data — no methods, no logic. Formatted for the view / HTTP response.
export interface PlaceOrderViewModel {
  orderId: string;
  statusLabel: string; // 'Pending' instead of 'PENDING'
  total: string;       // '$25.00' instead of 2500 (cents)
}

// One code per typed error the use case reports, plus the fallback. A string-literal union lets the
// compiler check the presenter's mapping and the route's status table.
export type PlaceOrderErrorCode = 'CUSTOMER_NOT_FOUND' | 'INVALID_ORDER' | 'UNKNOWN_ERROR';

export interface PlaceOrderErrorViewModel {
  message: string;
  code: PlaceOrderErrorCode;
}
```

## Presenter — the testable half

```typescript
// src/modules/orders/infrastructure/presenters/place-order-presenter.ts
// May import this module's application/ and domain/ and shared/; never platform/, main/, HTTP libraries or other modules.
import { IPlaceOrderOutputPort, PlaceOrderResponse } from '../../application/ports/output/place-order-output';
import { CustomerNotFoundError } from '../../application/errors/customer-not-found-error';
import { InvalidOrderError } from '../../domain/errors/invalid-order-error';
import { PlaceOrderErrorCode, PlaceOrderErrorViewModel, PlaceOrderViewModel } from './place-order-view-model';

const STATUS_LABELS: Record<string, string> = { PENDING: 'Pending', CANCELLED: 'Cancelled' };
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export class PlaceOrderPresenter implements IPlaceOrderOutputPort {
  private _viewModel: PlaceOrderViewModel | null = null;
  private _errorViewModel: PlaceOrderErrorViewModel | null = null;

  present(response: PlaceOrderResponse): void {
    this._viewModel = {
      orderId: response.orderId,
      statusLabel: STATUS_LABELS[response.status] ?? response.status,
      total: usd.format(response.totalCents / 100),
    };
  }

  presentError(error: Error): void {
    const code = this.mapErrorCode(error);
    // Never leak the message of an unexpected failure (driver errors, table names, stack details).
    this._errorViewModel = { code, message: code === 'UNKNOWN_ERROR' ? 'Unexpected error' : error.message };
  }

  get viewModel(): PlaceOrderViewModel | null { return this._viewModel; }
  get errorViewModel(): PlaceOrderErrorViewModel | null { return this._errorViewModel; }
  get hasError(): boolean { return this._errorViewModel !== null; }

  private mapErrorCode(error: Error): PlaceOrderErrorCode {
    if (error instanceof CustomerNotFoundError) return 'CUSTOMER_NOT_FOUND';
    if (error instanceof InvalidOrderError) return 'INVALID_ORDER';
    return 'UNKNOWN_ERROR';
  }
}
```

## The view — the humble half, in platform/web

```typescript
// src/platform/web/place-order-route.ts
// As thin as possible: reads what the presenter prepared and sends it. main/ builds a NEW presenter +
// controller pair per request (presenters are stateful) and injects the factory.
import type { Request, Response } from 'express';
import type { PlaceOrderController } from '../../modules/orders/infrastructure/controllers/place-order-controller';
import type { PlaceOrderPresenter } from '../../modules/orders/infrastructure/presenters/place-order-presenter';

export interface PlaceOrderPair { presenter: PlaceOrderPresenter; controller: PlaceOrderController }

// Delivery detail: which HTTP status each presenter error code gets.
const STATUS_BY_CODE = { CUSTOMER_NOT_FOUND: 404, INVALID_ORDER: 400, UNKNOWN_ERROR: 500 } as const;

export function placeOrderHandler(make: () => PlaceOrderPair) {
  return async (req: Request, res: Response): Promise<void> => {
    const { presenter, controller } = make();
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
import { CustomerNotFoundError } from '@/modules/orders/application/errors/customer-not-found-error';

describe('PlaceOrderPresenter', () => {
  it('formats the response model into a view model', () => {
    const p = new PlaceOrderPresenter();
    p.present({ orderId: 'o-1', status: 'PENDING', totalCents: 123456 });
    expect(p.viewModel).toEqual({ orderId: 'o-1', statusLabel: 'Pending', total: '$1,234.56' });
  });

  it('maps a typed error to its code', () => {
    const p = new PlaceOrderPresenter();
    p.presentError(new CustomerNotFoundError('c-9'));
    expect(p.errorViewModel).toEqual({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer c-9 not found' });
  });

  it('never leaks the message of an unexpected failure', () => {
    const p = new PlaceOrderPresenter();
    p.presentError(new Error('SQLITE_ERROR: no such table: orders'));
    expect(p.errorViewModel).toEqual({ code: 'UNKNOWN_ERROR', message: 'Unexpected error' });
  });
});
```
