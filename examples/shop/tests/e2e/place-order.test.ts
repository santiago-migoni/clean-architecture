import { describe, it, expect, afterEach } from 'vitest';
import { createApp } from '@/main';
import { bootstrapTestApp } from '@/main/index.test';
import { serve } from './http-test-server';

const item = (quantity: number, unitPriceCents = 250) => ({ productId: 'p1', quantity, unitPriceCents });
const dollars = (n: number) => '$' + n + '.00';

// The same HTTP scenarios run against the PRODUCTION composition root (real SQLite)
// and the TEST composition root (in-memory implementations of the same ports).
describe.each([
  ['real composition root (SQLite)', () => createApp().app],
  ['test composition root (in-memory)', () => bootstrapTestApp().app],
])('HTTP e2e - %s', (_name, makeApp) => {
  let http: Awaited<ReturnType<typeof serve>>;
  afterEach(() => http.close());
  const start = async () => {
    http = await serve(makeApp());
    return http;
  };

  it('registers a customer, reads it back, and 404s on an unknown one', async () => {
    const { send } = await start();
    const created = await send('POST', '/customers', { name: 'Ada', email: 'ADA@example.com' });
    expect(created.status).toBe(201);
    const found = await send('GET', '/customers/' + created.body.customerId);
    expect(found).toMatchObject({ status: 200, body: { name: 'Ada', email: 'ada@example.com' } });
    expect((await send('GET', '/customers/ghost')).status).toBe(404);
  });

  it('answers 409 for a duplicate email and does NOT destroy the first customer', async () => {
    const { send } = await start();
    const first = await send('POST', '/customers', { name: 'Ada', email: 'ada@example.com' });
    const second = await send('POST', '/customers', { name: 'Other', email: 'ada@example.com' });
    expect(second).toMatchObject({ status: 409, body: { message: 'Email ada@example.com is already registered' } });
    expect((await send('GET', '/customers/' + first.body.customerId)).status).toBe(200);
  });

  it('rejects an invalid customer with 400', async () => {
    const { send } = await start();
    const res = await send('POST', '/customers', { name: 'Ada', email: 'nope' });
    expect(res).toMatchObject({ status: 400, body: { message: 'Customer email is not valid' } });
  });

  it('places an order: the PRESENTER formats the response (cross-module check via the input port)', async () => {
    const { send } = await start();
    const { body: { customerId } } = await send('POST', '/customers', { name: 'Ada', email: 'ada@example.com' });
    const res = await send('POST', '/orders', { customerId, items: [item(3), item(1, 1000)] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ statusLabel: 'Pending', total: '$17.50' });
    expect(typeof res.body.orderId).toBe('string');
  });

  it('maps presenter error codes to HTTP statuses', async () => {
    const { send } = await start();
    const { body: { customerId } } = await send('POST', '/customers', { name: 'Ada', email: 'ada@example.com' });

    expect(await send('POST', '/orders', { customerId: 'ghost', items: [item(1)] }))
      .toMatchObject({ status: 404, body: { code: 'CUSTOMER_NOT_FOUND', message: 'Customer ghost not found' } });
    expect(await send('POST', '/orders', { customerId, items: [] }))
      .toMatchObject({ status: 400, body: { code: 'INVALID_ORDER' } });
    expect(await send('POST', '/orders', { customerId, items: [{ productId: 'p1', quantity: 'abc', unitPriceCents: 1 }] }))
      .toMatchObject({ status: 400, body: { code: 'INVALID_ORDER' } });
  });

  it('answers malformed JSON with 400 and never leaks internals', async () => {
    const { send } = await start();
    expect(await send('POST', '/orders', undefined, '{"customerId": '))
      .toMatchObject({ status: 400, body: { message: 'Malformed JSON' } });
  });

  // NOTE: this guards against mixed-up responses, but it cannot detect a shared presenter: the stack is
  // synchronous, so requests never really interleave. See presenter-isolation.test.ts for that guarantee.
  it('keeps every concurrent response with its own total', async () => {
    const { send } = await start();
    const { body: { customerId } } = await send('POST', '/customers', { name: 'Ada', email: 'ada@example.com' });
    const quantities = Array.from({ length: 25 }, (_, i) => i + 1);

    const results = await Promise.all(quantities.map((q) => send('POST', '/orders', { customerId, items: [item(q, 100)] })));

    // Each response must carry ITS OWN total (q x $1.00).
    results.forEach((r, i) => expect(r.body.total).toBe(dollars(quantities[i])));
    expect(new Set(results.map((r) => r.body.orderId)).size).toBe(25);
  });
});
