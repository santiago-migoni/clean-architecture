// src/modules/orders/infrastructure/presenters/place-order-presenter.ts
// Layer: infrastructure (Interface Adapters). Implements the Output Port defined in this module's application layer.
// May import: this module's application/ and domain/, src/shared/. NOT platform/, main/, HTTP libraries or other modules.
// This is the TESTABLE half of the Humble Object split: all formatting logic lives here, including the language:
// the use case returns codes (a status, a failure reason) and the presenter writes them for the request's locale.
import { IPlaceOrderOutputPort, PlaceOrderResponse } from '../../application/ports/output/place-order-output';
import { CustomerNotFoundError } from '../../application/errors/customer-not-found-error';
import { InvalidOrderError } from '../../domain/errors/invalid-order-error';
import type { Translate } from './place-order-messages';
import { PlaceOrderViewModel, PlaceOrderErrorViewModel } from './place-order-view-model';

// The amount is in US dollars whatever the language: the currency is a fact of the order, not of the reader.
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export class PlaceOrderPresenter implements IPlaceOrderOutputPort {
  private _viewModel: PlaceOrderViewModel | null = null;
  private _errorViewModel: PlaceOrderErrorViewModel | null = null;

  // One presenter per request: the locale is the request's.
  constructor(private readonly t: Translate, private readonly locale: string) {}

  // Called by the interactor
  present(response: PlaceOrderResponse): void {
    const key = `STATUS.${response.status}`;
    const label = this.t(this.locale, key);
    this._viewModel = {
      orderId: response.orderId,
      statusLabel: label === key ? response.status : label,
      total: usd.format(response.totalCents / 100),
    };
  }

  presentError(error: Error): void {
    if (error instanceof CustomerNotFoundError) {
      this.fail('CUSTOMER_NOT_FOUND', this.t(this.locale, 'CUSTOMER_NOT_FOUND', { customerId: error.customerId }));
    } else if (error instanceof InvalidOrderError) {
      this.fail('INVALID_ORDER', this.t(this.locale, `INVALID_ORDER.${error.reason}`));
    } else {
      // Never leak the message of an unexpected failure (DB driver errors, stack details, ...)
      this.fail('UNKNOWN_ERROR', this.t(this.locale, 'UNKNOWN_ERROR'));
    }
  }

  // Read by the View (HTTP route handler)
  get viewModel(): PlaceOrderViewModel | null { return this._viewModel; }
  get errorViewModel(): PlaceOrderErrorViewModel | null { return this._errorViewModel; }
  get hasError(): boolean { return this._errorViewModel !== null; }

  private fail(code: PlaceOrderErrorViewModel['code'], message: string): void {
    this._errorViewModel = { code, message };
  }
}
