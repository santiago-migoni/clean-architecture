---
name: gateway
description: "This skill should be used when the user asks to \"create a gateway\", \"implement a repository\", \"add a data mapper\", \"add an in-memory repository\", \"add a database migration for a module\", or \"reach another module through its input port\" from a module's infrastructure/gateways/ (The Database is a Detail)."
argument-hint: "<module>/<Name>"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or review a **Gateway** (also called Repository or Data Mapper) — the adapter that connects the application to the database or external services.

The argument after the command is `<module>/<Name>` (e.g., `orders/OrderRepository`, `billing/PaymentGateway`, `customers/EmailGateway`). The module selects the folder under `modules/`. If the project has a single module the prefix may be omitted.

## What is a Gateway?

From the book (Chapter 22 — The Clean Architecture):
> "The database is a detail. The web is a detail. These things are on the outer layers, not the inner ones."

A Gateway:
- Lives in the **Interface Adapters** layer (the module's `infrastructure/gateways/`).
- **Implements** a Repository/Gateway interface defined in the **application** layer of the same module (`application/ports/output/`).
- Translates between **Domain Entities** (inner layer) and **Database rows / external API responses** (outer layer).
- Hides all knowledge of the database schema, ORM, or external API format from the use cases.
- The use case **never knows** whether data comes from SQL, NoSQL, a REST API, or an in-memory store.

## The Database is a Detail

This is a central theme of the book. The architecture must not be coupled to:
- Which database engine is used (PostgreSQL, MongoDB, DynamoDB).
- Whether data is stored locally or remotely.
- The ORM framework (TypeORM, SQLAlchemy, Hibernate, Prisma).

The interface defined in `application/ports/output/` is the **contract**; the gateway is the **implementation detail**.

The gateway may import third-party libraries (an ORM, an HTTP client SDK), but it MUST NOT import this project's `platform/` folder: the connection/client object is created in `platform/db` (or `platform/external`) and **injected from the composition root** through the constructor.

## Data Flow

```
Interactor (application/interactors/)
  → I<Domain>Repository (interface in application/ports/output/)
  ← <Domain>RepositoryImpl (gateway in infrastructure/gateways/)
       → ORM client / DB connection (created in platform/db/, injected by the composition root)
         → Database
```

## Your Task

**Before writing code, read the reference for the project's language**, and the SQL one when the gateway uses a relational database. They have complete examples of every step below (persistence model, SQL gateway, in-memory gateway, cross-module gateway, integration test) for the `customers` and `orders` modules:

- [TypeScript / JavaScript](references/typescript.md)
- [Python](references/python.md)
- [Go](references/go.md)
- [SQL](references/sql.md) — migrations, table ownership, upserts, query files

For another language, apply the same structure with its idioms. Names follow "Language conventions" in the `rules` skill.

### Step 1: Verify the Repository Interface
The interface should already exist (created during `/clean-architecture:usecase`) in the module's `application/ports/output/`. If it does not, create it there now — in the APPLICATION layer, never in infrastructure — with only the methods this module's use cases call.

### Step 2: Create the Data Mapper / Persistence Model
Keep the database row shape separate from the domain entity, beside the gateway (they evolve independently). Map rows to entities with the entity's **reconstitution** path (invariants re-checked, no creation-time effects) and entities to rows field by field.

If the domain does not track the creation time, leave `created_at` out of the row: let the database fill it (`DEFAULT CURRENT_TIMESTAMP`) and keep it out of the upsert's update list, so an update never touches it.

### Step 3: Create the Gateway Implementation
In the module's `infrastructure/gateways/`, named after the technology when several exist (`sql-customer-repository`). The connection, pool or ORM session is a constructor parameter: created in `platform/db/`, injected by the composition root.

### Persistence rules learned the hard way (SQL)
- **Upsert by id, never `INSERT OR REPLACE`.** In SQLite (and `REPLACE INTO` in MySQL) a conflict on *any* unique constraint deletes the other row: saving a second customer with an existing email silently destroyed the first one. Use `INSERT ... ON CONFLICT(id) DO UPDATE SET ...` so a different row with the same unique value raises a constraint error.
- **Translate that error, do not let the driver's leak.** Declare the failure on the port's contract (`save` may fail with `EmailAlreadyRegisteredError`, an application error) and have the gateway convert the unique-constraint violation into it. The gateway still enforces no business rule — it reports a persistence fact in the application's vocabulary.
- **The in-memory repository must honour the same contract** (same error for the same conflict), otherwise use case tests pass against a repository that behaves differently from production.
- **Each module owns its tables.** No query, `ALTER` or foreign key on another module's tables; `ca_scan` reports it (`table-ownership`).

### Step 4: Create an In-Memory Gateway for Testing (on demand)
Create it the first time a use case test needs a repository — not before, and not as an empty folder. Reuse it afterwards. It lives in `infrastructure/gateways/in-memory/` (`in_memory/` in Python, package `inmemory` in Go).

### Migrations
Schema migrations belong to the module that owns the tables: `infrastructure/gateways/migrations/`. Only the connection setup and the runner that executes every module's migrations live in `platform/db/`, invoked from the composition root.

### Step 5: Create Gateway Integration Tests
Against a real (test) database — in TypeScript and Python in `tests/<module>/integration/`, in Go beside the gateway behind `//go:build integration`:
- Round-trip: save → find returns the same domain entity.
- The mapper: domain fields map correctly to and from columns.
- Not found: find returns nothing for a missing id.
- The conflict: a different row with the same unique value fails with the port's error, and the first row survives.

### Step 6: Gateway that reaches ANOTHER module (cross-module recipe)
When the use case needs something owned by another module (e.g. `orders` must check that a customer exists):

1. The calling module declares a port in its own vocabulary in `application/ports/output/` (`CustomerLookup`).
2. The gateway implementing it lives in the **calling** module's `infrastructure/gateways/` and calls the other module's **input port** — the only cross-module import allowed.
3. The composition root injects the other module's interactor (as its input port) into this gateway.
4. Never import `customers/domain/` or `customers/infrastructure/`, and never read the `customers` tables; the calling module's domain stores only `customerId`.

## Validation Checklist

- [ ] Repository interface lives in the module's `application/ports/output/` (NOT in infrastructure).
- [ ] Gateway implementation lives in the module's `infrastructure/gateways/`.
- [ ] The gateway does not import `platform/`, the composition root, or another module — except another module's `application/ports/input/` in a cross-module gateway.
- [ ] ORM/DB-specific code (ORM models and decorators, driver calls, SQL) is ONLY in the gateway and persistence files.
- [ ] The use case interactor imports only the interface — never the implementation.
- [ ] The DB connection / ORM client is injected from the composition root, never imported from `platform/`.
- [ ] `save` is an upsert by id (no `REPLACE`); a unique-constraint violation is translated into the error declared by the port; a test proves that the pre-existing row survives the conflict.
- [ ] Data mapper correctly translates domain ↔ persistence (field names, types, nullability).
- [ ] An in-memory implementation exists once a use case test needs one (created on demand).
- [ ] Migrations for this module's tables live in `infrastructure/gateways/migrations/`; the connection and the migration runner live in `platform/db/`.
- [ ] The gateway does NOT enforce business rules — it just stores/retrieves data.
- [ ] The module's SQL uses only the tables its own migrations create.

## SRP Check
- The gateway changes when the **persistence technology or schema** changes.
- It does NOT change when business rules change (that's the entity/interactor).

## Output
After creating files, show:
1. The interface definition and which use cases depend on it.
2. The field mapping between domain entity and persistence model.
3. Which tests use the in-memory gateway vs. the real implementation.
