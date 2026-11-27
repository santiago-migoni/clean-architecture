---
name: main
description: "This skill should be used when the user asks to \"create the composition root\", \"wire the dependencies\", \"update main\", \"connect two modules\", \"add a new entry point (api, worker, cli)\", or to move object creation out of inner layers into src/main/ (Clean Architecture Chapter 26)."
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or update the **Main Component** — the composition root of the application.

## What is the Main Component?

From the book (Chapter 26 — The Main Component):
> "Think of Main as the dirtiest of all the dirty components. Main is the ultimate detail — the lowest-level policy. It is the initial entry point of the system. Nothing, other than the operating system, depends on it. Its job is to create all the Factories, Strategies, and other global facilities, and then hand control over to the high-level abstract portions of the system."

Main is:
- The **composition root** — the single place where the entire object graph is assembled.
- The **most volatile** component — it changes whenever a new use case, adapter, module or framework is added.
- The **only** place where concrete implementations are instantiated.
- The **only** place where dependency injection is wired (if not using a DI framework).
- The **only** place that connects modules to each other.
- A **plugin** to the rest of the system — the system doesn't know about Main.

## The Plugin Architecture

Main composes one module at a time, then connects them:

```
         Main (dirty, knows everything)
           │
           ├── platform: createDbConnection()          (src/platform/db)
           │
           ├── composeCustomers({ db })                (src/main/compose/customers)
           │     ├── creates SqlCustomerRepository     (customers/infrastructure/gateways)
           │     ├── creates GetCustomerInteractor     (customers/application/interactors)
           │     └── exposes input port IGetCustomerUseCase  ← the only thing others may use
           │
           ├── composeOrders({ db, getCustomer })      (src/main/compose/orders)
           │     ├── creates SqlOrderRepository        (orders/infrastructure/gateways)
           │     ├── creates CustomerLookupGateway(getCustomer)   ← cross-module link
           │     └── PlaceOrderInteractor + PlaceOrderController
           │         (+ a PlaceOrderPresenter per request ONLY if the use case has an Output Port)
           │
           └── registerRoutes(app, routes)             (src/platform/web)
```

## Your Task

### Step 1: Audit the Current State
- Scan the codebase for any `new ConcreteClass()` calls outside of `src/main/` or `tests/`.
- Identify all dependencies that need wiring, module by module.
- List all use cases, their interactors, presenters, and gateways per module.
- List the cross-module ports (`<other>-lookup`, …) and which input port implements each.

### Step 2: Create the Main Files

One entry point → `src/main/index.<ext>`. Several (api, worker, cli) → one folder per entry point, all sharing the `compose/<m>.<ext>` functions: `src/main/api/index.<ext>`, `src/main/worker/index.<ext>`.

```
src/main/
├── index.<ext>               ← entry point: platform → modules → server
├── compose/                  ← NOT named "modules/": src/modules/ is the business code
│   ├── customers.<ext>       ← compose<Module>(deps) per module
│   └── orders.<ext>
├── index.test.<ext>          ← test composition root (in-memory implementations)
└── config/
    └── environment.<ext>     ← environment variable parsing (a detail)
```

#### TypeScript (Express, manual DI)

`src/main/compose/orders.ts` — wires ONE module:
```typescript
// src/main/compose/orders.ts
// Composition of the `orders` module. Only src/main/ may import concrete classes.

import type { Request, Response } from 'express';
import type { DbConnection } from '../../platform/db/connection';
import type { IGetCustomerUseCase } from '../../modules/customers/application/ports/input/get-customer';

import { SqlOrderRepository } from '../../modules/orders/infrastructure/gateways/sql-order-repository';
import { CustomerLookupGateway } from '../../modules/orders/infrastructure/gateways/customer-lookup-gateway';
import { PlaceOrderInteractor } from '../../modules/orders/application/interactors/place-order';
import { PlaceOrderController } from '../../modules/orders/infrastructure/controllers/place-order-controller';

export interface OrdersDeps {
  db: DbConnection;
  newId: () => string;              // randomness is injected, never generated inside a use case
  getCustomer: IGetCustomerUseCase; // customers' INPUT port — the only legal cross-module link
}

export function composeOrders({ db, newId, getCustomer }: OrdersDeps) {
  // Gateways (stateless, shared)
  const orderRepository = new SqlOrderRepository(db);
  const customerLookup = new CustomerLookupGateway(getCustomer);

  // Default: the interactor returns a response model — nothing is stateful, build once.
  const placeOrderController = new PlaceOrderController(
    new PlaceOrderInteractor(orderRepository, customerLookup, newId),
  );

  return { routes: { placeOrder: (req: Request, res: Response) => placeOrderController.handle(req, res) } };
}
```

Variant — the use case has an Output Port + Presenter. Presenters are stateful (they hold the view model), so build the presenter, interactor and controller **per request** with a factory and never share a presenter between requests:
```typescript
const makePlaceOrder = () => {
  const presenter = new PlaceOrderPresenter();
  const interactor = new PlaceOrderInteractor(presenter, orderRepository, customerLookup, newId);
  return { presenter, controller: new PlaceOrderController(interactor) };
};
return { routes: { makePlaceOrder } }; // platform/web wraps the factory in the humble route handler
```

`src/main/compose/customers.ts` — same shape; it also **exposes its input ports** for other modules:
```typescript
export function composeCustomers({ db, newId }: { db: DbConnection; newId: () => string }) {
  const customerRepository = new SqlCustomerRepository(db);
  const getCustomer: IGetCustomerUseCase = new GetCustomerInteractor(customerRepository);
  // ... routes ...
  return { ports: { getCustomer }, routes: { /* ... */ } };
}
```

`src/main/index.ts` — the composition root, as a **factory** (so tests can import the app without opening a port):
```typescript
// src/main/index.ts
// THE MAIN COMPONENT — The Composition Root
//
// This is the ONLY place that knows about ALL modules and layers. That is by design.
// Nothing imports from main/ except the OS entry point (server.ts) and the tests.

import { randomUUID } from 'node:crypto';
import { createDbConnection } from '../platform/db/connection';
import { runMigrations } from '../platform/db/migrate';
import { buildHttpApp } from '../platform/web/app';
import { composeCustomers, customersMigrations } from './compose/customers';
import { composeOrders, ordersMigrations } from './compose/orders';

export function createApp(options: { dbPath?: string } = {}) {
  // 1. Infrastructure (platform) — environment variables are read here and in server.ts only
  const db = createDbConnection(options.dbPath ?? process.env.DB_PATH ?? ':memory:');
  runMigrations(db, [...customersMigrations, ...ordersMigrations]); // each module hands over its own migrations
  const newId = () => randomUUID(); // randomness is injected into use cases, never generated inside them

  // 2. Compose modules in dependency order; cross-module ties are INPUT PORTS
  const customers = composeCustomers({ db, newId });
  const orders = composeOrders({ db, newId, getCustomer: customers.ports.getCustomer });

  // 3. HTTP: platform/web builds the Express app from the handlers each module exposes
  const app = buildHttpApp({ ...customers.routes, ...orders.routes });
  return { app, db };
}
```
`src/main/server.ts` — the actual entry point, as small as possible:
```typescript
import { createApp } from './index';

const port = Number(process.env.PORT ?? 3000);
createApp().application.listen(port, () => console.log(`Server running on port ${port}`));
```
Each `compose<Module>` returns `{ ports, routes }`: `ports` are the input ports other modules may use, `routes` are ready-to-register handlers (controllers wrapped with `(req, res) => controller.handle(req, res)`). `platform/web/app.ts` owns `express()`, `express.json()`, route registration and the last-resort error handler (malformed JSON → 400, anything else → 500 with no internals).

> Using a synchronous driver such as `node:sqlite`? It must be created once in `platform/db` and injected; the gateways take the connection type as a constructor argument and never import `platform/`.

#### Python (FastAPI, manual DI)
```python
# src/main/compose/orders.py
from ...modules.orders.infrastructure.gateways.sql_order_repository import SqlOrderRepository
from ...modules.orders.infrastructure.gateways.customer_lookup_gateway import CustomerLookupGateway
from ...modules.orders.application.interactors.place_order import PlaceOrderInteractor
from ...modules.orders.infrastructure.controllers.place_order_controller import PlaceOrderController

def compose_orders(db_session, new_id, get_customer):
    order_repo = SqlOrderRepository(db_session)
    customer_lookup = CustomerLookupGateway(get_customer)

    place_order = PlaceOrderController(PlaceOrderInteractor(order_repo, customer_lookup, new_id))

    # With an Output Port + Presenter, build presenter + interactor + controller per request
    # (a factory returning (presenter, controller)); presenters are stateful.
    return {"routes": {"place_order": place_order}}

# src/main/app.py
from uuid import uuid4
from fastapi import FastAPI
from ..platform.db.connection import create_db_session
from ..platform.web.routes import register_routes
from .compose.customers import compose_customers
from .compose.orders import compose_orders

def create_app() -> FastAPI:
    app = FastAPI()
    db = create_db_session()
    new_id = lambda: str(uuid4())  # randomness is injected into use cases
    customers = compose_customers(db, new_id)
    orders = compose_orders(db, new_id, customers["ports"]["get_customer"])
    register_routes(app, {**customers["routes"], **orders["routes"]})
    return app

app = create_app()
```

#### With a DI Framework (TypeScript + tsyringe / NestJS / InversifyJS)
```typescript
// src/main/container.ts
import 'reflect-metadata';
import { container } from 'tsyringe';

// Register interfaces → concrete implementations, per module
container.register<IOrderRepository>('IOrderRepository', { useClass: SqlOrderRepository });
container.register<ICustomerLookup>('ICustomerLookup', { useClass: CustomerLookupGateway });
container.register<IPlaceOrderUseCase>('IPlaceOrderUseCase', { useClass: PlaceOrderInteractor });

// The container IS the Main component — wiring lives here, not scattered throughout the app.
// Decorators (@injectable) in modules/ are a framework dependency: prefer registering by token here
// so domain/ and application/ stay free of the DI library.
```

### Step 3: Environment-Specific Main Files

Different environments can have different main files. The test composition root swaps infrastructure for in-memory implementations **of the same ports**:

```typescript
// src/main/index.test.ts — used by integration/e2e tests
export function bootstrapTestApp() {  // returns { app, ...repositories }: the SAME handlers on in-memory ports
  const orderRepository = new OrderInMemoryRepository();
  const customerLookup: ICustomerLookup = { exists: async () => true }; // fake port, no customers module needed
  let n = 0;
  const newId = () => `id-${++n}`; // deterministic ids in tests
  const placeOrder = new PlaceOrderController(
    new PlaceOrderInteractor(orderRepository, customerLookup, newId));
  // ... return wired app
}
```

## Validation Checklist

- [ ] `src/main/` is the ONLY location with `new ConcreteGateway()` or `new ConcreteInteractor()`.
- [ ] `src/platform/` registers routes and creates connections, but never instantiates interactors or gateways.
- [ ] Presenters (if any) are built per request; they are never shared between requests — guarded by a deterministic test on the factory (see the `test` skill), not by a concurrency test.
- [ ] `index.ts` exports a factory and does not listen; a tiny `server.ts` is the only entry point that starts the server.
- [ ] The same HTTP scenarios run against the production composition root and the test composition root.
- [ ] No other production code file (outside `main/`) uses `new` on a cross-layer dependency.
- [ ] No module and no layer inside `src/` imports from `main/`.
- [ ] Modules are connected only here, and only through input ports (`compose<Module>` returns the ports others may use).
- [ ] Module composition order has no cycles (A needs B's port ⇒ B is composed first, B does not need A).
- [ ] Environment variables are read ONLY in main (or in a config module loaded by main).
- [ ] The DI wiring is in one place — not scattered across the app.
- [ ] A test composition root exists that swaps infrastructure for in-memory alternatives.
- [ ] Main is not tested by unit tests — its correctness is validated by integration/e2e tests.

## SRP of Main
Main changes when:
- A new module or use case is added (new wiring needed).
- An implementation is swapped (e.g., switch DB engine).
- A new environment is added.
It does NOT change because of business rule changes — those are in domain/application.

## Output
After creating/updating Main:
1. The complete wiring diagram, module by module.
2. All dependencies wired and where their interfaces are defined.
3. The cross-module links and the input port behind each.
4. How to add a new use case, and how to add a new module (step-by-step).
5. How to swap an implementation (e.g., switch from PostgreSQL to DynamoDB).
