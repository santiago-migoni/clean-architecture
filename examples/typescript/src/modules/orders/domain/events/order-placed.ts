// src/modules/orders/domain/events/order-placed.ts
// A DOMAIN EVENT: something the business cares about happened. Plain, immutable data in orders' vocabulary.
// Why it exists here: other modules react to placed orders (loyalty awards points; an audit log records them),
// and the use case must not know who. The infrastructure maps it to the published contract (ports/published).
import type { Order } from '../order';

export interface OrderPlaced {
  readonly type: 'OrderPlaced';
  readonly orderId: string;
  readonly customerId: string;
  readonly totalCents: number;
}

export const orderPlaced = (order: Order): OrderPlaced => ({
  type: 'OrderPlaced',
  orderId: order.id,
  customerId: order.customerId,
  totalCents: order.totalCents,
});
