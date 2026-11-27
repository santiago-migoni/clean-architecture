// Layer: infrastructure. Implements IOrderEvents by publishing each domain event as orders' integration event.
// It maps the domain event (orders' own vocabulary) to the published contract (what other modules may rely on).
// The bus is injected by main/ as a function: this adapter never imports platform/.
import type { IOrderEvents } from '../../application/ports/output/order-events';
import { ORDER_PLACED_V1, type OrderPlacedV1 } from '../../application/ports/published/order-placed-v1';
import type { OrderPlaced } from '../../domain/events/order-placed';

export class PublishedOrderEvents implements IOrderEvents {
  constructor(private readonly send: (event: OrderPlacedV1) => Promise<void>) {}

  async publish(event: OrderPlaced): Promise<void> {
    await this.send({ type: ORDER_PLACED_V1, orderId: event.orderId, customerId: event.customerId, totalCents: event.totalCents });
  }
}
