// src/modules/orders/app/interactors/place-order.ts
// Layer: app. May import: this module's domain/ and app/, src/shared/. Never infra/, platform/, main/ or another module.
// This use case HAS an Output Port (the response is formatted by a Presenter), so `execute` returns void.
import { Order } from '../../domain/order';
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
      // Application rule: an order needs an existing customer (owned by another module → via the port)
      if (!(await this.customerLookup.exists(request.customerId))) {
        throw new CustomerNotFoundError(request.customerId);
      }
      const order = Order.create({ id: this.newId(), customerId: request.customerId, lines: request.lines });
      await this.repository.save(order);
      this.outputPort.present({ orderId: order.id, status: order.status, totalCents: order.totalCents });
    } catch (error) {
      this.outputPort.presentError(error as Error);
    }
  }
}
