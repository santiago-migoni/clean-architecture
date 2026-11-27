// src/modules/orders/domain/events/order-placed.ts
// A DOMAIN EVENT: something the business cares about happened. Plain, immutable data in orders' vocabulary.
// Why it exists here: placed orders must be recorded in an audit log, and the use case should not know how.
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
