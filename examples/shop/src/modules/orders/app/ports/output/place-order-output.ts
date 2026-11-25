// src/modules/orders/app/ports/output/place-order-output.ts
// Output Port: implemented by the Presenter (infra), called by the interactor.
// Plain data only — no framework objects.

export interface PlaceOrderResponse {
  orderId: string;
  status: string;
  totalCents: number;
}

export interface IPlaceOrderOutputPort {
  present(response: PlaceOrderResponse): void;
  presentError(error: Error): void;
}
