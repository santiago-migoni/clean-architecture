import { describe, it, expect, afterEach, vi } from 'vitest';
import { createApp } from '@/main';
import { bootstrapTestApp } from '@/main/index.test';
import { serve } from './http-test-server';

const item = (quantity: number, unitPriceCents = 250) => ({ productId: 'p1', quantity, unitPriceCents });
const dollars = (n: number) => '$' + n + '.00';

// The same HTTP scenarios run against the PRODUCTION composition root (real SQLite)
// and the TEST composition root (in-memory implementations of the same ports).
describe.each([
  ['real composition root (SQLite)', () => createApp({ auditLog: () => {} }).app],
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
    expect(second).toMatchObject({ status: 409, body: { code: 'EMAIL_ALREADY_REGISTERED', message: 'Email ada@example.com is already registered' } });
    expect((await send('GET', '/customers/' + first.body.customerId)).status).toBe(200);
  });

  it('rejects an invalid customer with 400', async () => {
    const { send } = await start();
    const res = await send('POST', '/customers', { name: 'Ada', email: 'nope' });
    expect(res).toMatchObject({ status: 400, body: { code: 'INVALID_CUSTOMER', message: 'Customer email is not valid' } });
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
    // A missing field is a malformed request (400), not a missing customer (404)
    expect(await send('POST', '/orders', { items: [item(1)] }))
      .toMatchObject({ status: 400, body: { code: 'INVALID_ORDER' } });
    expect(await send('POST', '/orders', { customerId, items: [{ quantity: 1, unitPriceCents: 100 }] }))
      .toMatchObject({ status: 400, body: { code: 'INVALID_ORDER' } });
  });

  it('answers malformed JSON with 400 and never leaks internals', async () => {
    const { send } = await start();
    expect(await send('POST', '/orders', undefined, '{"customerId": '))
      .toMatchObject({ status: 400, body: { code: 'MALFORMED_JSON', message: 'Malformed JSON' } });
  });

  it('awards loyalty points for each placed order, through orders\' published event', async () => {
    const { send } = await start();
    const { body: { customerId } } = await send('POST', '/customers', { name: 'Ada', email: 'ada@example.com' });
    expect(await send('GET', '/loyalty/' + customerId)).toMatchObject({ status: 200, body: { customerId, points: 0 } });

    await send('POST', '/orders', { customerId, items: [item(3), item(1, 1000)] }); // $17.50 → 17 points
    await send('POST', '/orders', { customerId, items: [item(2)] });                // $5.00  → 5 points
    await send('POST', '/orders', { customerId, items: [] });                       // not placed: no event, no points
    expect(await send('GET', '/loyalty/' + customerId)).toMatchObject({ status: 200, body: { customerId, points: 22 } });
  });

  it('answers in the language of Accept-Language, and in English when it is not spoken', async () => {
    const { send } = await start();
    const es = { 'accept-language': 'es-AR,es;q=0.9,en;q=0.5' };
    const { body: { customerId } } = await send('POST', '/customers', { name: 'Ada', email: 'ada@example.com' });

    expect(await send('POST', '/customers', { name: 'Ada', email: 'nope' }, undefined, es))
      .toMatchObject({ status: 400, body: { code: 'INVALID_CUSTOMER', message: 'El email del cliente no es válido' } });
    expect(await send('GET', '/customers/ghost', undefined, undefined, es))
      .toMatchObject({ status: 404, body: { code: 'CUSTOMER_NOT_FOUND', message: 'No existe el cliente ghost' } });
    expect(await send('POST', '/orders', { customerId, items: [] }, undefined, es))
      .toMatchObject({ status: 400, body: { code: 'INVALID_ORDER', message: 'El pedido debe tener al menos una línea' } });
    expect(await send('POST', '/orders', { customerId, items: [item(1)] }, undefined, es))
      .toMatchObject({ status: 201, body: { statusLabel: 'Pendiente', total: '$2.50' } });
    expect(await send('POST', '/orders', undefined, '{"customerId": ', es))
      .toMatchObject({ status: 400, body: { code: 'MALFORMED_JSON', message: 'JSON mal formado' } });
    expect(await send('GET', '/customers/ghost', undefined, undefined, { 'accept-language': 'fr-FR,de;q=0.8' }))
      .toMatchObject({ status: 404, body: { message: 'Customer ghost not found' } });
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

describe('HTTP e2e - a failing subscriber (real composition root)', () => {
  it('never fails the order: it is placed, the failure is logged, and loyalty simply has no points for it', async () => {
    const { app, db } = createApp({ auditLog: () => {} });
    const http = await serve(app);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { body: { customerId } } = await http.send('POST', '/customers', { name: 'Ada', email: 'ada@example.com' });
      db.exec('DROP TABLE loyalty_awards'); // loyalty breaks; orders must not notice
      const res = await http.send('POST', '/orders', { customerId, items: [item(4)] });
      expect(res).toMatchObject({ status: 201, body: { statusLabel: 'Pending' } });
      expect(logged).toHaveBeenCalledWith('Subscriber failed on orders.order-placed.v1:', expect.objectContaining({ message: expect.stringContaining('no such table') }));
    } finally {
      logged.mockRestore();
      await http.close();
    }
  });
});

describe('HTTP e2e - the audit log records every integration event (real composition root)', () => {
  it('writes one JSON line per published event', async () => {
    const lines: string[] = [];
    const http = await serve(createApp({ auditLog: (line) => lines.push(line) }).app);
    try {
      const { body: { customerId } } = await http.send('POST', '/customers', { name: 'Ada', email: 'ada@example.com' });
      const { body: { orderId } } = await http.send('POST', '/orders', { customerId, items: [item(1)] });
      expect(lines.map((l) => JSON.parse(l))).toEqual([{ type: 'orders.order-placed.v1', orderId, customerId, totalCents: 250 }]);
    } finally {
      await http.close();
    }
  });
});

describe('HTTP e2e - unexpected failures (real composition root)', () => {
  it('answers 500 without internals AND logs the original error', async () => {
    const { app, db } = createApp({ auditLog: () => {} });
    const http = await serve(app);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { body: { customerId } } = await http.send('POST', '/customers', { name: 'Ada', email: 'ada@example.com' });
      db.exec('DROP TABLE order_lines; DROP TABLE orders'); // the DB breaks under the use case
      const res = await http.send('POST', '/orders', { customerId, items: [item(1)] });
      expect(res).toMatchObject({ status: 500, body: { code: 'UNKNOWN_ERROR', message: 'Unexpected error' } });
      expect(JSON.stringify(res.body)).not.toContain('no such table');
      expect(logged).toHaveBeenCalledWith('Unhandled error:', expect.objectContaining({ message: expect.stringContaining('no such table') }));
    } finally {
      logged.mockRestore();
      await http.close();
    }
  });
});
