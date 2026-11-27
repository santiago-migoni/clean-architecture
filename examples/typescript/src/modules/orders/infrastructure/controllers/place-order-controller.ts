// src/modules/orders/infrastructure/controllers/place-order-controller.ts
// Layer: infrastructure (Interface Adapters)
// May import: this module's application/ (interactor), domain/ (type references only), src/shared/.
// May NOT import: platform/, main/, or another module's domain/ or infrastructure/.
//
// This use case has an Output Port + Presenter, so the controller NEVER touches `res`:
// it only translates the request and calls the use case. The thin route handler in
// platform/web reads the presenter afterwards.
import type { Request } from 'express'; // framework knowledge is confined to this layer
import { PlaceOrderInteractor, PlaceOrderRequest } from '../../application/interactors/place-order';
import type { PlaceOrderHttpRequest } from './place-order-http-request';

export class PlaceOrderController {
  constructor(private readonly useCase: PlaceOrderInteractor) {}

  async handle(req: Request): Promise<void> {
    const body = (req.body ?? {}) as Partial<PlaceOrderHttpRequest>;

    // HTTP-level concerns only: type coercion and vocabulary translation (items → lines).
    // Business validation stays in the entity; a malformed line surfaces as an InvalidOrderError.
    const request: PlaceOrderRequest = {
      customerId: String(body.customerId ?? ''),
      lines: Array.isArray(body.items)
        ? body.items.map((i) => ({
            productId: String(i?.productId ?? ''),
            quantity: Number(i?.quantity),
            unitPriceCents: Number(i?.unitPriceCents),
          }))
        : [],
    };

    await this.useCase.execute(request);
  }
}
