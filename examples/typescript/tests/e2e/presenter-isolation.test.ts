import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';
import { createDbConnection } from '@/platform/db/connection';
import { composeOrders } from '@/main/compose/orders';

// Presenters hold the view model, so the composition root must build a NEW presenter per request.
// This is tested on the factory itself, deterministically: a concurrency test over a synchronous
// stack (node:sqlite, in-memory repositories) cannot expose sharing, because every request finishes
// before the next one starts.
describe('composeOrders - presenter isolation', () => {
  const compose = (customerExists: (id: string) => boolean) =>
    composeOrders({
      db: createDbConnection(),
      newId: (() => { let n = 0; return () => 'o-' + ++n; })(),
      publish: async () => {},
      defaultLocale: 'en',
      getCustomer: { execute: vi.fn(async ({ customerId }) => (customerExists(customerId) ? { id: customerId, name: 'n', email: 'e@e.co' } : null)) },
    }).routes.makePlaceOrder;

  it('builds a new presenter and a new controller on every call', () => {
    const make = compose(() => true);
    const a = make('en');
    const b = make('en');
    expect(a.presenter).not.toBe(b.presenter);
    expect(a.controller).not.toBe(b.controller);
  });

  it('keeps the state of two interleaved requests apart', async () => {
    // The DB is fresh, so the order tables do not exist: this only checks the lookup path.
    const make = compose((id) => id === 'known');
    const failing = make('en');
    const other = make('en');

    await failing.controller.handle({ body: { customerId: 'ghost', items: [{ productId: 'p', quantity: 1, unitPriceCents: 1 }] } } as Request);

    expect(failing.presenter.hasError).toBe(true);
    expect(failing.presenter.errorViewModel?.code).toBe('CUSTOMER_NOT_FOUND');
    // The second pair never ran: nothing leaked into it from the first one
    expect(other.presenter.hasError).toBe(false);
    expect(other.presenter.viewModel).toBeNull();
  });
});
