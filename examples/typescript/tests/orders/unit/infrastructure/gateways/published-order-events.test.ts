import { describe, it, expect } from 'vitest';
import { PublishedOrderEvents } from '@/modules/orders/infrastructure/gateways/published-order-events';
import type { OrderPlacedV1 } from '@/modules/orders/application/ports/published/order-placed-v1';

describe('PublishedOrderEvents', () => {
  it('maps the domain event to the published contract, and publishes it', async () => {
    const sent: OrderPlacedV1[] = [];
    await new PublishedOrderEvents(async (event) => { sent.push(event); })
      .publish({ type: 'OrderPlaced', orderId: 'o-1', customerId: 'c-1', totalCents: 2500 });
    expect(sent).toEqual([{ type: 'orders.order-placed.v1', orderId: 'o-1', customerId: 'c-1', totalCents: 2500 }]);
  });
});
