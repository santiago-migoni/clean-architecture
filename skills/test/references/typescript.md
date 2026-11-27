# Tests — TypeScript / JavaScript

Layout: `tests/<module>/unit/{domain,application,infrastructure}/`, `tests/<module>/integration/` (flat: gateways against a real database), `tests/e2e/`. Test imports use the `@/` alias for `src/`, so they do not depend on directory depth. The examples come from `examples/shop` (Vitest).

The test of each piece is in that piece's skill reference: entity (`entity`), interactor (`usecase`), presenter (`presenter`), controller (`controller`), gateway integration test (`gateway`). This page holds what spans several pieces.

## Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Only tests/: the test composition root src/main/index.test.ts is not a suite.
  test: { include: ['tests/**/*.test.ts'] },
});
```

`"test:unit": "vitest run tests/*/unit"` runs the fast suite, with no database and no port. With Jest, repeat `moduleNameMapper` inside each project — Jest does not inherit it from the root when `projects` is used:

```json
{
  "jest": {
    "projects": [
      { "displayName": "unit", "testMatch": ["<rootDir>/tests/*/unit/**/*.test.ts"], "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" } },
      { "displayName": "integration", "testMatch": ["<rootDir>/tests/*/integration/**/*.test.ts"], "moduleNameMapper": { "^@/(.*)$": "<rootDir>/src/$1" } }
    ]
  }
}
```

## Cross-module gateway — only the other module's input port is faked

```typescript
// tests/orders/unit/infrastructure/gateways/customer-lookup-gateway.test.ts
import { describe, expect, it, vi } from 'vitest';
import { CustomerLookupGateway } from '@/modules/orders/infrastructure/gateways/customer-lookup-gateway';
import type { IGetCustomerUseCase } from '@/modules/customers/application/ports/input/get-customer';

describe('CustomerLookupGateway', () => {
  it('translates the customers answer into orders vocabulary (a boolean)', async () => {
    const getCustomer: IGetCustomerUseCase = {
      execute: vi.fn().mockResolvedValueOnce({ id: 'c-1', name: 'Ada', email: 'a@b.co' }).mockResolvedValueOnce(null),
    };
    const gateway = new CustomerLookupGateway(getCustomer);
    expect(await gateway.exists('c-1')).toBe(true);
    expect(await gateway.exists('ghost')).toBe(false);
  });
});
```

## Repository contract — the same scenarios against the real and the in-memory gateway

```typescript
// tests/customers/integration/customer-repository-contract.test.ts
import { describe, expect, it } from 'vitest';
import { createDbConnection } from '@/platform/db/connection';
import { runMigrations } from '@/platform/db/migrate';
import { customersMigrations } from '@/main/compose/customers';
import type { ICustomerRepository } from '@/modules/customers/application/ports/output/customer-repository';
import { SqlCustomerRepository } from '@/modules/customers/infrastructure/gateways/sql-customer-repository';
import { CustomerInMemoryRepository } from '@/modules/customers/infrastructure/gateways/in-memory/customer-in-memory-repository';
import { Customer } from '@/modules/customers/domain/customer';
import { EmailAlreadyRegisteredError } from '@/modules/customers/application/errors/email-already-registered-error';

const sql = (): ICustomerRepository => {
  const db = createDbConnection();
  runMigrations(db, customersMigrations);
  return new SqlCustomerRepository(db);
};

describe.each([['SQL', sql], ['in-memory', () => new CustomerInMemoryRepository()]])('%s customer repository', (_name, make) => {
  it('rejects a second customer with the same email, and the first one survives', async () => {
    const repository = make();
    await repository.save(Customer.create({ id: 'c-1', name: 'Ada', email: 'ada@example.com' }));
    await expect(repository.save(Customer.create({ id: 'c-2', name: 'Other', email: 'ada@example.com' })))
      .rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect((await repository.findById('c-1'))?.name).toBe('Ada');
  });
});
```

## A new presenter per request — tested on the factory, deterministically

```typescript
// tests/e2e/presenter-isolation.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createDbConnection } from '@/platform/db/connection';
import { composeOrders } from '@/main/compose/orders';

describe('composeOrders - presenter isolation', () => {
  it('builds a new presenter and a new controller on every call', () => {
    const make = composeOrders({
      db: createDbConnection(),
      newId: () => 'o-1',
      getCustomer: { execute: vi.fn().mockResolvedValue(null) },
    }).routes.makePlaceOrder;
    const a = make();
    const b = make();
    expect(a.presenter).not.toBe(b.presenter);
    expect(a.controller).not.toBe(b.controller);
  });
});
```

## HTTP e2e through both composition roots

```typescript
// tests/e2e/place-order.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import type { Express } from 'express';
import type { AddressInfo } from 'node:net';
import { createApp } from '@/main';
import { bootstrapTestApp } from '@/main/index.test';

async function serve(app: Express) {
  const server = app.listen(0); // port 0: any free port
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const send = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { send, close: () => server.close() };
}

describe.each([
  ['production root (SQLite)', () => createApp().app],
  ['test root (in-memory)', () => bootstrapTestApp().app],
])('POST /orders - %s', (_name, makeApp) => {
  let http: Awaited<ReturnType<typeof serve>>;
  afterEach(() => http.close());

  it('answers 404 with the presenter error code for an unknown customer', async () => {
    http = await serve(makeApp());
    const res = await http.send('POST', '/orders', { customerId: 'ghost', items: [{ productId: 'p1', quantity: 1, unitPriceCents: 250 }] });
    expect(res).toMatchObject({ status: 404, body: { code: 'CUSTOMER_NOT_FOUND' } });
  });
});
```
