import { describe, it, expect } from 'vitest';
import { Order } from '@/modules/orders/domain/order';

const line = { productId: 'p1', quantity: 2, unitPriceCents: 1000 };

describe('Order entity', () => {
  it('creates a PENDING order and computes the total', () => {
    const o = Order.create({ id: 'o-1', customerId: 'c-1', lines: [line, { ...line, productId: 'p2', quantity: 1, unitPriceCents: 500 }] });
    expect(o.status).toBe('PENDING');
    expect(o.totalCents).toBe(2500);
  });

  it('rejects an order with no lines', () => {
    expect(() => Order.create({ id: 'o-1', customerId: 'c-1', lines: [] })).toThrow('at least one line');
  });

  it('rejects a non-positive quantity', () => {
    expect(() => Order.create({ id: 'o-1', customerId: 'c-1', lines: [{ ...line, quantity: 0 }] })).toThrow('quantity');
  });

  it('can be cancelled only while PENDING', () => {
    const pending = Order.create({ id: 'o-1', customerId: 'c-1', lines: [line] });
    const cancelled = Order.reconstitute({ id: 'o-2', customerId: 'c-1', lines: [line], status: 'CANCELLED' });
    expect(pending.canBeCancelled()).toBe(true);
    expect(cancelled.canBeCancelled()).toBe(false);
  });

  it('references the customer by id only', () => {
    const o = Order.create({ id: 'o-1', customerId: 'c-1', lines: [line] });
    expect(o.customerId).toBe('c-1');
  });
});
