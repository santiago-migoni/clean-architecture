# Example: orders + customers

A small, runnable project that shows what the plugin produces. It was built by applying the plugin's skills
(`init`, `entity`, `usecase`, `gateway`, `controller`, `presenter`, `main`, `test`) and then hardened: every
guard test in it was proven with a *mutation check* (the code was broken on purpose and the test failed).

Express 5 · SQLite (`node:sqlite`, built in) · TypeScript · Vitest · ESLint with `eslint-plugin-boundaries`.

```bash
cd examples/shop
npm ci
npm run typecheck && npm run lint   # tsc + architecture rules enforced as lint errors
npm test                            # 52 tests (29 unit tests need no DB and no port)
npm start                           # http://localhost:3000  (PORT and DB_PATH are optional)
```

Requires Node 22.13+ (`node:sqlite` without a flag).

## Try it

```bash
curl -X POST localhost:3000/customers -H 'content-type: application/json' \
     -d '{"name":"Ada Lovelace","email":"ada@example.com"}'
# {"customerId":"…"}

curl -X POST localhost:3000/orders -H 'content-type: application/json' \
     -d '{"customerId":"<id>","items":[{"productId":"book","quantity":3,"unitPriceCents":1299}]}'
# {"orderId":"…","statusLabel":"Pending","total":"$38.97"}   ← formatted by the Presenter
```

| Request | Answer |
|---|---|
| `POST /customers` | `201 {customerId}` · `400` invalid · `409` email already registered |
| `GET /customers/:id` | `200` · `404` |
| `POST /orders` | `201` view model · `404 CUSTOMER_NOT_FOUND` · `400 INVALID_ORDER` · `500` unexpected (logged, no internals) |
| malformed JSON | `400`; unexpected failures are `500` with no internals |

## Structure

```
src/
├── modules/
│   ├── customers/
│   │   ├── domain/            customer.ts, errors/invalid-customer-error.ts
│   │   ├── app/
│   │   │   ├── ports/input/   get-customer.ts        ← public surface: orders calls it
│   │   │   ├── ports/output/  customer-repository.ts
│   │   │   ├── errors/        email-already-registered-error.ts
│   │   │   └── interactors/   get-customer.ts, register-customer.ts
│   │   └── infra/adapters/
│   │       ├── controllers/   register-customer-controller.ts, get-customer-controller.ts, dtos/
│   │       └── gateways/      sql-customer-repository.ts, persistence/, in-memory/, migrations/
│   └── orders/
│       ├── domain/            order.ts, errors/invalid-order-error.ts
│       ├── app/
│       │   ├── ports/output/  order-repository.ts, customer-lookup.ts, place-order-output.ts
│       │   ├── errors/        customer-not-found-error.ts
│       │   └── interactors/   place-order.ts
│       └── infra/adapters/
│           ├── controllers/   place-order-controller.ts, dtos/
│           ├── presenters/    place-order-presenter.ts, view-models/
│           └── gateways/      sql-order-repository.ts, customer-lookup-gateway.ts, in-memory/, migrations/
├── platform/                  db/{connection,migrate}.ts · web/{app,routes,place-order-route}.ts
└── main/                      index.ts (createApp) · server.ts (listen) · compose/{customers,orders}.ts · index.test.ts
tests/<module>/{unit,integration}/ · tests/e2e/
```

## What it demonstrates

| Idea | Where to look |
|---|---|
| **Dependency Rule** (`infra → app → domain`) | `eslint.config.js` turns it into lint errors; `/clean-architecture:check` agrees |
| **Module Rule** — `orders` never imports `customers`' domain or infra | `orders/app/ports/output/customer-lookup.ts` (port owned by `orders`) → `orders/infra/adapters/gateways/customer-lookup-gateway.ts` → `customers/app/ports/input/get-customer.ts` |
| **Optional pieces are optional** | `RegisterCustomer` has no Input Port and no Presenter; `GetCustomer` has an Input Port because another module calls it; `PlaceOrder` has an Output Port + Presenter because it formats money and status |
| **Humble Object** | `place-order-presenter.ts` holds the logic and is tested without HTTP; `platform/web/place-order-route.ts` only reads it and sends |
| **Infrastructure is injected** | gateways take the DB connection in their constructor and never import `platform/`; `src/main/` is the only place that instantiates concrete classes |
| **Typed errors** | `domain/errors/` (entity rules) and `app/errors/` (use case failures) are mapped by `instanceof` in controllers/presenters, never by message text |
| **Composition per module** | `main/compose/<module>.ts`; modules are tied together only through input ports |
| **One composition root for production, one for tests** | `main/index.ts` (SQLite) and `main/index.test.ts` (in-memory); the same HTTP scenarios run against both |

## Guards that a happy-path test would miss

- **Duplicate email does not destroy data** — an early version used `INSERT OR REPLACE`, which silently deleted the *other* customer. Now: upsert by id, a unique-constraint violation becomes `EmailAlreadyRegisteredError` (409), and a test proves the first customer survives (`tests/customers/integration/…/sql-customer-repository.test.ts`, `tests/e2e/place-order.test.ts`).
- **A presenter is never shared between requests** — guarded by a deterministic test on the factory (`tests/e2e/presenter-isolation.test.ts`). A concurrency test over this synchronous stack cannot detect sharing; it passed with the bug.
- **No leaked internals** — an unexpected failure reaches the client as `Unexpected error`, never the driver message.

## Out of scope

No authentication, no update/cancel use cases, no pagination, and the database is in memory unless `DB_PATH` is set.
It is TypeScript only: the plugin's Python/Java configuration snippets (`import-linter`, ArchUnit) are not exercised here.
