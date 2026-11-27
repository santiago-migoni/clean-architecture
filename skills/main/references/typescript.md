# Composition root — TypeScript / JavaScript

Files: `src/main/index.ts` (a factory that builds the app), `src/main/server.ts` (the entry point that listens), `src/main/compose/<module>.ts` (one function per module), `src/main/index.test.ts` (test composition root). Several entry points: `src/main/<app>/index.ts`, all sharing `compose/`. The examples are the real files of `examples/typescript` (Express 5, `node:sqlite`, manual DI).

## One function per module

```typescript
// src/main/compose/customers.ts — composition of the customers module
import type { Request, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import type { IGetCustomerUseCase } from '../../modules/customers/application/ports/input/get-customer';
import { SqlCustomerRepository } from '../../modules/customers/infrastructure/gateways/sql-customer-repository';
import { GetCustomerInteractor } from '../../modules/customers/application/interactors/get-customer';
import { RegisterCustomerInteractor } from '../../modules/customers/application/interactors/register-customer';
import { RegisterCustomerController } from '../../modules/customers/infrastructure/controllers/register-customer-controller';

export function composeCustomers({ db, newId }: { db: DatabaseSync; newId: () => string }) {
  const repository = new SqlCustomerRepository(db);
  // The input port is what other modules may use: expose it explicitly.
  const getCustomer: IGetCustomerUseCase = new GetCustomerInteractor(repository);
  const register = new RegisterCustomerController(new RegisterCustomerInteractor(repository, newId)); // stateless: build once

  return {
    ports: { getCustomer },
    routes: { registerCustomer: (req: Request, res: Response) => register.handle(req, res) },
  };
}
```

```typescript
// src/main/compose/orders.ts — composition of the orders module
import type { DatabaseSync } from 'node:sqlite';
import type { IGetCustomerUseCase } from '../../modules/customers/application/ports/input/get-customer';
import { SqlOrderRepository } from '../../modules/orders/infrastructure/gateways/sql-order-repository';
import { CustomerLookupGateway } from '../../modules/orders/infrastructure/gateways/customer-lookup-gateway';
import { PlaceOrderInteractor } from '../../modules/orders/application/interactors/place-order';
import { PlaceOrderPresenter } from '../../modules/orders/infrastructure/presenters/place-order-presenter';
import { PlaceOrderController } from '../../modules/orders/infrastructure/controllers/place-order-controller';

export interface OrdersDeps {
  db: DatabaseSync;
  newId: () => string;
  getCustomer: IGetCustomerUseCase; // customers' INPUT port: the only legal cross-module link
}

export function composeOrders({ db, newId, getCustomer }: OrdersDeps) {
  const orderRepository = new SqlOrderRepository(db);
  const customerLookup = new CustomerLookupGateway(getCustomer);

  // PlaceOrder has an Output Port: presenters are stateful, so presenter + interactor + controller
  // are built PER REQUEST and a presenter is never shared between requests.
  const makePlaceOrder = () => {
    const presenter = new PlaceOrderPresenter();
    const interactor = new PlaceOrderInteractor(presenter, orderRepository, customerLookup, newId);
    return { presenter, controller: new PlaceOrderController(interactor) };
  };
  return { routes: { makePlaceOrder } };
}
```

## The composition root — a factory

```typescript
// src/main/index.ts — the ONLY place that knows every module and layer. Nothing imports from main/.
import { randomUUID } from 'node:crypto';
import { createDbConnection } from '../platform/db/connection';
import { runMigrations } from '../platform/db/migrate';
import { buildHttpApp } from '../platform/web/app';
import { composeCustomers, customersMigrations } from './compose/customers';
import { composeOrders, ordersMigrations } from './compose/orders';

export function createApp(options: { dbPath?: string } = {}) {
  // 1. Drivers (platform), with values from the configuration. The environment is never read here.
  const db = createDbConnection(options.dbPath ?? ':memory:');
  runMigrations(db, [...customersMigrations, ...ordersMigrations]);
  const newId = () => randomUUID();

  // 2. Modules in dependency order; the cross-module tie is an input port.
  const customers = composeCustomers({ db, newId });
  const orders = composeOrders({ db, newId, getCustomer: customers.ports.getCustomer });

  // 3. Delivery
  return { app: buildHttpApp({ ...customers.routes, ...orders.routes }), db };
}
```

## Configuration — read once, validated, passed as values

```typescript
// src/main/config.ts — a pure function of the environment it is given: testable without touching process.env.
export interface AppConfig {
  readonly dbPath: string;
  readonly port: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Invalid configuration: ${message}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const dbPath = env.DB_PATH?.trim() || ':memory:';
  const portText = env.PORT?.trim() || '3000';
  const port = /^\d+$/.test(portText) ? Number(portText) : NaN;
  if (!(port >= 1 && port <= 65535)) throw new ConfigError(`PORT must be a whole number from 1 to 65535, got "${portText}"`);
  return { dbPath, port };
}
```

```typescript
// src/main/server.ts — the entry point, and the only line of the project that touches process.env.
import { loadConfig } from './config';
import { createApp } from './index';

const config = loadConfig(process.env); // a wrong setting stops here, before anything starts
createApp({ dbPath: config.dbPath }).app.listen(config.port, () => console.log(`Server running on port ${config.port}`));
```

## Test composition root — the same ports, in-memory implementations

```typescript
// src/main/index.test.ts
import type { Request, Response } from 'express';
import { buildHttpApp } from '../platform/web/app';
import { CustomerInMemoryRepository } from '../modules/customers/infrastructure/gateways/in-memory/customer-in-memory-repository';
import { OrderInMemoryRepository } from '../modules/orders/infrastructure/gateways/in-memory/order-in-memory-repository';
import { GetCustomerInteractor } from '../modules/customers/application/interactors/get-customer';
import { RegisterCustomerInteractor } from '../modules/customers/application/interactors/register-customer';
import { RegisterCustomerController } from '../modules/customers/infrastructure/controllers/register-customer-controller';
import { PlaceOrderInteractor } from '../modules/orders/application/interactors/place-order';
import { PlaceOrderPresenter } from '../modules/orders/infrastructure/presenters/place-order-presenter';
import { PlaceOrderController } from '../modules/orders/infrastructure/controllers/place-order-controller';
import { CustomerLookupGateway } from '../modules/orders/infrastructure/gateways/customer-lookup-gateway';

export function bootstrapTestApp() {
  let n = 0;
  const newId = () => `id-${++n}`; // deterministic ids
  const customers = new CustomerInMemoryRepository();
  const orders = new OrderInMemoryRepository();
  const getCustomer = new GetCustomerInteractor(customers);
  const register = new RegisterCustomerController(new RegisterCustomerInteractor(customers, newId));

  const app = buildHttpApp({
    registerCustomer: (req: Request, res: Response) => register.handle(req, res),
    makePlaceOrder: () => {
      const presenter = new PlaceOrderPresenter();
      const interactor = new PlaceOrderInteractor(presenter, orders, new CustomerLookupGateway(getCustomer), newId);
      return { presenter, controller: new PlaceOrderController(interactor) };
    },
  });
  return { app, orders };
}
```

## With a DI container

Manual wiring is the default. With a container (tsyringe, InversifyJS, NestJS), the registrations ARE the composition root: keep them all in `src/main/`, and keep the container's decorators out of `domain/` and `application/` (register classes by token instead of decorating them).

```typescript
// src/main/container.ts
import 'reflect-metadata';
import { container } from 'tsyringe';
import { createDbConnection } from '../platform/db/connection';
import { SqlCustomerRepository } from '../modules/customers/infrastructure/gateways/sql-customer-repository';
import { GetCustomerInteractor } from '../modules/customers/application/interactors/get-customer';
import { loadConfig } from './config';

const db = createDbConnection(loadConfig(process.env).dbPath);
container.register('CustomerRepository', { useValue: new SqlCustomerRepository(db) });
container.register('GetCustomer', {
  useFactory: (c) => new GetCustomerInteractor(c.resolve('CustomerRepository')),
});
```
