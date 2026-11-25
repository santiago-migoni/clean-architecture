// src/modules/orders/app/interactors/place-order.ts
// Layer: app. May import: this module's domain/ and app/, src/shared/. Never infra/, platform/, main/ or another module.
// This use case HAS an Output Port (the response is formatted by a Presenter), so `execute` returns void.
import { Order } from '../../domain/order';
import { InvalidOrderError } from '../../domain/errors/invalid-order-error';
import { CustomerNotFoundError } from '../errors/customer-not-found-error';
import { IOrderRepository } from '../ports/output/order-repository';
import { ICustomerLookup } from '../ports/output/customer-lookup';
import { IPlaceOrderOutputPort } from '../ports/output/place-order-output';

export interface PlaceOrderRequest {
  customerId: string;
  lines: { productId: string; quantity: number; unitPriceCents: number }[];
}

export class PlaceOrderInteractor {
  constructor(
    private readonly outputPort: IPlaceOrderOutputPort,
    private readonly repository: IOrderRepository,
    private readonly customerLookup: ICustomerLookup,
    private readonly newId: () => string, // injected: randomness does not belong in business rules
  ) {}

  async execute(request: PlaceOrderRequest): Promise<void> {
    try {
      // Enterprise rules first: a malformed order (no customer id, empty product id, ...) is invalid
      // whether or not the customer exists, so it is rejected before calling another module.
      const order = Order.create({ id: this.newId(), customerId: request.customerId, lines: request.lines });
      // Application rule: an order needs an existing customer (owned by another module → via the port)
      if (!(await this.customerLookup.exists(order.customerId))) {
        throw new CustomerNotFoundError(order.customerId);
      }
      await this.repository.save(order);
      this.outputPort.present({ orderId: order.id, status: order.status, totalCents: order.totalCents });
    } catch (error) {
      // Only the failures this use case declares are presented. Anything else (a DB failure, a bug)
      // is rethrown so the last-resort handler logs it and answers 500 — never swallowed here.
      if (error instanceof CustomerNotFoundError || error instanceof InvalidOrderError) {
        this.outputPort.presentError(error);
        return;
      }
      throw error;
    }
  }
}
