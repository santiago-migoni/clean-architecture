---
name: main
description: "This skill should be used when the user asks to \"create the composition root\", \"wire the dependencies\", \"update main\", \"connect two modules\", \"add a new entry point (api, worker, cli)\", or to move object creation out of inner layers into the composition root (Clean Architecture Chapter 26)."
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
           ├── platform: open the DB connection         (platform/db)
           │
           ├── compose customers (db)                   (one function per module)
           │     ├── creates SqlCustomerRepository     (customers/infrastructure/gateways)
           │     ├── creates GetCustomerInteractor     (customers/application/interactors)
           │     └── exposes its input port GetCustomer  ← the only thing others may use
           │
           ├── compose orders (db, getCustomer)        (one function per module)
           │     ├── creates SqlOrderRepository        (orders/infrastructure/gateways)
           │     ├── creates CustomerLookupGateway(getCustomer)   ← cross-module link
           │     └── PlaceOrderInteractor + PlaceOrderController
           │         (+ a PlaceOrderPresenter per request ONLY if the use case has an Output Port)
           │
           └── register the routes                     (platform/web)
```

## Your Task

### Step 1: Audit the Current State
- Scan the codebase for any construction of a concrete class across layers (`new SqlOrderRepository(...)`, `SqlOrderRepository(...)`, `NewSQLOrderRepository(...)`) outside the composition root and the tests.
- Identify all dependencies that need wiring, module by module.
- List all use cases, their interactors, presenters, and gateways per module.
- List the cross-module ports (`<other>-lookup`, …) and which input port implements each.

### Step 2: Create the Main Files

Where the composition root lives depends on the language (see "Language conventions" in the `rules` skill):

| | One entry point | Several entry points (api, worker, cli) |
|---|---|---|
| TypeScript / JavaScript | `src/main/index` (factory) + `src/main/server` (listens), `src/main/compose/<module>` | `src/main/<app>/index`, sharing `compose/` |
| Python | `src/<package>/main/app.py` (factory) + `main/__main__.py`, `main/compose/<module>.py` | `main/<app>/__main__.py`, sharing `compose/` |
| Go | `internal/bootstrap/` (one file per module + `bootstrap.go`) + `cmd/<app>/main.go` | one `cmd/<app>/main.go` per entry point, all calling bootstrap |

The folder of per-module functions is never called `modules/`: that name is the business code.

**Before writing code, read the reference for the project's language.** Each one wires the `customers` and `orders` modules: one function per module that exposes its input ports, the composition root as a factory, the tiny entry point, and the test composition root:

- [TypeScript / JavaScript](references/typescript.md) — also: wiring with a DI container
- [Python](references/python.md)
- [Go](references/go.md)

What every composition root does, in this order:
1. **Drivers** (`platform/`): open the database connection, run every module's migrations, create clients, with the values of the configuration. The configuration is loaded by a config module in `main/` (`config` in TypeScript and Python, `bootstrap/settings.go` in Go): a pure function of the environment it is given, which validates every value and fails at startup. The entry point is the only code that touches the environment itself; it passes it to that function.
2. **Modules in dependency order**: each module function builds its gateways, interactors and controllers and returns the **input ports** other modules may use plus its **routes**. The cross-module tie is always an input port passed to the other module's function (A needs B's port ⇒ B is composed first, and B never needs A).
3. **Delivery**: hand the routes to `platform/web/`, which owns the framework, route registration and the last-resort error handler.

Presenters are stateful (they hold the view model): when a use case has an Output Port, its module function returns a **factory** that builds a NEW presenter, interactor and controller per request. Controllers without a presenter are stateless and built once.

The composition root is a **factory** that returns the app without starting it, so tests can build it without opening a port; a separate, tiny entry point starts the server. A synchronous driver (an embedded database) is still created once in `platform/db/` and injected: gateways take the connection as a constructor argument and never import `platform/`.

### Step 3: Environment-Specific Main Files

Different environments can have different composition roots. The **test composition root** wires the same use cases, controllers and presenters on **in-memory implementations of the same ports**, with deterministic ids, so the same HTTP scenarios run against both roots (see the `test` skill).

## Validation Checklist

- [ ] The composition root is the ONLY place that constructs gateways and interactors.
- [ ] `platform/` registers routes and creates connections, but never constructs interactors or gateways.
- [ ] Presenters (if any) are built per request; they are never shared between requests — guarded by a deterministic test on the factory (see the `test` skill), not by a concurrency test.
- [ ] The composition root is a factory that does not listen; a tiny entry point is the only code that starts the server.
- [ ] The same HTTP scenarios run against the production composition root and the test composition root.
- [ ] No other production code constructs a cross-layer dependency.
- [ ] No module and no layer imports the composition root.
- [ ] Modules are connected only here, and only through input ports (each module function returns the ports others may use).
- [ ] Module composition order has no cycles (A needs B's port ⇒ B is composed first, B does not need A).
- [ ] Environment variables are read ONLY in main, once, by the entry point; the config module validates them and fails at startup (`ca_scan` reports `config-placement` anywhere else).
- [ ] Each piece receives only the configuration values it uses, never the whole configuration object.
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
