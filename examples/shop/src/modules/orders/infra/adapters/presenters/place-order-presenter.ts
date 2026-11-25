// src/modules/orders/infra/adapters/presenters/place-order-presenter.ts
// Layer: infra (Interface Adapters). Implements the Output Port defined in this module's app layer.
// May import: this module's app/ and domain/, src/shared/. NOT platform/, main/, HTTP libraries or other modules.
// This is the TESTABLE half of the Humble Object split: all formatting logic lives here.
import { IPlaceOrderOutputPort, PlaceOrderResponse } from '../../../app/ports/output/place-order-output';
import { CustomerNotFoundError } from '../../../app/errors/customer-not-found-error';
import { InvalidOrderError } from '../../../domain/errors/invalid-order-error';
import { PlaceOrderViewModel, PlaceOrderErrorViewModel } from './view-models/place-order-view-model';

const STATUS_LABELS: Record<string, string> = { PENDING: 'Pending', CANCELLED: 'Cancelled' };
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export class PlaceOrderPresenter implements IPlaceOrderOutputPort {
  private _viewModel: PlaceOrderViewModel | null = null;
  private _errorViewModel: PlaceOrderErrorViewModel | null = null;

  // Called by the interactor
  present(response: PlaceOrderResponse): void {
    this._viewModel = {
      orderId: response.orderId,
      statusLabel: STATUS_LABELS[response.status] ?? response.status,
      total: usd.format(response.totalCents / 100),
    };
  }

  presentError(error: Error): void {
    const code = this.mapErrorCode(error);
    this._errorViewModel = {
      code,
      // Never leak the message of an unexpected failure (DB driver errors, stack details, ...)
      message: code === 'UNKNOWN_ERROR' ? 'Unexpected error' : error.message,
    };
  }

  // Read by the View (HTTP route handler)
  get viewModel(): PlaceOrderViewModel | null { return this._viewModel; }
  get errorViewModel(): PlaceOrderErrorViewModel | null { return this._errorViewModel; }
  get hasError(): boolean { return this._errorViewModel !== null; }

  private mapErrorCode(error: Error): PlaceOrderErrorViewModel['code'] {
    if (error instanceof CustomerNotFoundError) return 'CUSTOMER_NOT_FOUND';
    if (error instanceof InvalidOrderError) return 'INVALID_ORDER';
    return 'UNKNOWN_ERROR';
  }
}
