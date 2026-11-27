// src/platform/web/place-order-route.ts
// The HUMBLE OBJECT: as thin as possible. It reads what the Presenter prepared and sends it.
// platform/ never instantiates interactors or gateways: main/ builds the presenter + controller
// pair (one per request — presenters are stateful) and injects the factory.
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

    if (presenter.hasError) {
      res.status(STATUS_BY_CODE[presenter.errorViewModel!.code]).json(presenter.errorViewModel);
    } else {
      res.status(201).json(presenter.viewModel);
    }
  };
}
