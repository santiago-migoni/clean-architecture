# Shop — Architecture

Two modules (`customers`, `orders`) over Express and SQLite. This document describes the project as it is;
the [README](../../README.md) covers how to run it and what each part demonstrates.

## Layout

```
src/
├── modules/<module>/{domain,application,infrastructure}   business code, one folder per capability
├── platform/{db, web}                                     frameworks & drivers: SQLite connection, Express
└── main/                                                  composition root (createApp) + server.ts (listen)
tests/<module>/unit/ (mirrors the module)  ·  tests/<module>/integration/ (flat, gateways)  ·  tests/e2e/
```

## The two rules

**Layers** — dependencies point inward inside a module: `infrastructure → application → domain`.
`infrastructure` never imports `platform/`: the SQLite connection is created in `platform/db`
and injected through the constructors by `main/`.

| From ↓ / To → | domain | application | infrastructure | platform | main |
|---|---|---|---|---|---|
| **domain** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **application** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **infrastructure** | ✅ | ✅ | ✅ | ❌ | ❌ |
| **platform** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **main** | ✅ | ✅ | ✅ | ✅ | ✅ |

**Modules** — a module never imports another module's `domain/` or `infrastructure/`.

```
orders                                                customers
  application/ports/output/customer-lookup.ts   (owned by orders, orders' vocabulary)
        ▲ implemented by
  infrastructure/gateways/customer-lookup-gateway.ts ──calls──▶ application/ports/input/get-customer.ts
```

`orders` stores only a `customerId`; there is no foreign key between the two modules' tables.
`main/compose/orders.ts` receives `customers`' input port and hands it to the gateway.

## Which optional pieces each use case has, and why

| Use case | Input Port | Output Port + Presenter | Reason |
|---|---|---|---|
| `customers/RegisterCustomer` | no | no | one entry point, the response needs no formatting |
| `customers/GetCustomer` | **yes** | no | `orders` calls it, so it is a public surface |
| `orders/PlaceOrder` | no | **yes** | formats money (`$17.50`) and the status label; nobody else calls it |

## Decisions worth knowing

- **Typed errors, mapped by `instanceof`.** Entity rules throw `domain/errors/*`; use case failures throw
  `application/errors/*`. Controllers and the presenter map them to HTTP statuses/codes; unexpected errors are rethrown
  (or shown as `Unexpected error`) and never leak driver messages.
- **Persistence is an upsert by id, never `INSERT OR REPLACE`.** `REPLACE` deletes any row that conflicts on
  *any* unique constraint, which destroyed an existing customer when a second one reused its email. A unique
  violation is translated into `EmailAlreadyRegisteredError` (declared on the port) → `409`.
- **A presenter is stateful, so `main/compose/orders.ts` builds one per request.** This is guarded by a
  deterministic test on the factory (`tests/e2e/presenter-isolation.test.ts`); a concurrency test over this
  synchronous stack cannot detect sharing.
- **Randomness is injected** (`newId`) into the interactors; business rules never generate ids.
- **Migrations live with their module** (`infrastructure/gateways/migrations/`); `platform/db/migrate.ts` is a
  generic runner and `main/` hands it every module's migrations.
- **`main/compose/`, not `main/modules/`**: `src/modules/` is the business code and the same name twice confuses people.
- **`index.ts` exports a factory and `server.ts` listens**, so tests import the app without opening a port.
  `index.test.ts` is the test composition root: the same handlers over in-memory implementations of the same ports.

## What enforces it

| Mechanism | Enforces |
|---|---|
| `npm run lint` (`eslint.config.js`, `eslint-plugin-boundaries`) | both rules, as lint errors |
| `/clean-architecture:check` (`ca_scan`) | the same rules, from the plugin's engine |
| `npm test` | behaviour, the repository contract (the first customer survives a conflict), presenter isolation |

## Adding things

- **A use case** → an interactor in `application/interactors/`, a port in `application/ports/output/` for what it needs, a typed error
  if it can fail in a way the caller must react to. Add an Input Port only if another module or a second entry point
  will call it; add an Output Port + Presenter only if the output needs real formatting.
- **A module** → `src/modules/<name>/{domain,application,infrastructure}`, a `main/compose/<name>.ts`, its migrations, and its tests
  under `tests/<name>/`. Talk to other modules only through their input ports.
- **Another entry point** (worker, CLI) → `src/main/<app>/index.ts` sharing the same `compose/` functions.
