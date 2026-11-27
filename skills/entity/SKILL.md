---
name: entity
description: "This skill should be used when the user asks to \"create an entity\", \"add a domain model\", \"add a value object\", \"model the enterprise business rules\", or to review a file in a module's domain/ folder for framework, use-case or persistence leaks (Clean Architecture Chapter 20)."
argument-hint: "<module>/<EntityName>"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or review an **Entity** — the innermost layer of Clean Architecture, containing Enterprise Business Rules.

The argument after the command is `<module>/<EntityName>` (e.g., `orders/Order`, `customers/Customer`, `billing/Invoice`). The module selects the folder under `modules/`. If the project has a single module, the prefix may be omitted; if the module does not exist yet, create `modules/<module>/` with its `domain/`, `application/` and `infrastructure/` folders first.

In this layout the Entities layer is the module's `domain/` folder.

## What is an Entity?

From the book (Chapter 20 — Business Rules):
> "Entities encapsulate Enterprise-wide Critical Business Rules. An entity can be an object with methods, or it can be a set of data structures and functions. It doesn't matter so long as the entities could be used by many different applications in the enterprise."

Entities are:
- The **most stable** code in the system — they change only when enterprise-wide business rules change.
- **Framework-independent** — no HTTP, no SQL, no ORM, no UI.
- **Application-independent** — no use case logic lives here.
- **Testable** without any infrastructure.

## Your Task

### Step 1: Understand the Domain
- Read the existing codebase to understand the domain context.
- Identify what business rules are **enterprise-wide** (apply across all use cases) vs. **application-specific** (belong in a use case).

### Step 2: Design the Entity

An entity should contain:
1. **Identity** — how the entity is uniquely identified (EntityId value object).
2. **State** — the core data fields representing the business concept.
3. **Business Rules** (Critical Business Rules) — methods that enforce invariants and policies that are true regardless of the application.
4. **No I/O** — no database calls, no HTTP calls, no logging frameworks.

### Step 3: Generate the Entity File

Place it in the module's `domain/` folder, under the language's code root and with its naming (see "Language conventions" in the `rules` skill): `src/modules/orders/domain/order.ts`, `src/shop/modules/orders/domain/order.py`, `internal/modules/orders/domain/order.go`.

References to entities of **other modules** are by id only (`customerId`). Never import another module's `domain/`.

**Before writing code, read the reference for the project's language.** Each one has a complete, idiomatic entity (the `Order` of the `orders` module: identity, state, invariants, a critical business rule, creation vs. reconstitution), a domain error, a value object and the entity's test:

- [TypeScript / JavaScript](references/typescript.md)
- [Python](references/python.md)
- [Go](references/go.md)

For a language without a reference, apply the same structure with that language's idioms. Adapt the names to the user's domain; keep the shape.

### Step 4: Create Value Objects (if needed)
- If the entity has complex attributes (Address, DateRange), create value objects next to it in the module's `domain/` folder.
- If a value object is genuinely used by several modules (Money, Id), put it in `shared/` instead — keep that folder minimal and free of module-specific policy.
- Value objects are immutable, equality by value (not identity).

### Step 5: Domain building blocks — only when the first one exists
Keep `domain/` flat while it is small: one file per entity (and its value objects). Create a subfolder the first time its content appears, never in advance:
- **Events** — when the entity raises an important business event (OrderPlaced, PaymentReceived): `domain/events/`.
- **Errors** — when a rule violation deserves a named domain error (OutOfStockError) instead of a generic one: `domain/errors/` (in Go, a sentinel or error type in the `domain` package).
- **Domain services** — only for a rule that spans several entities and does not belong to any of them (PricingPolicy): `domain/services/`.
- **Aggregates** — when several entities must change together under one invariant, make one the aggregate root and reference the others only through it; the repository interface is then per aggregate root.
If none of these exists yet, create none of these folders.

### Step 6: Create Entity Tests
Create the entity's unit test where the language puts tests (`tests/<module>/unit/domain/` in TypeScript and Python, a `_test.go` beside the file in Go):
- Test each critical business rule method.
- Test invariant enforcement (invalid state should throw/raise).
- Test equality.
- NO mocks needed — entities are pure.

## Validation Checklist

After creating the entity, verify:
- [ ] The entity file has **zero imports** from `application/`, `infrastructure/`, `platform/`, the composition root, another module, or any third-party library (only `shared/` is allowed).
- [ ] Entities of other modules are referenced by id only.
- [ ] All business rules that are enterprise-wide are in the entity (not scattered in use cases).
- [ ] The entity uses a factory method or constructor that enforces invariants.
- [ ] State is private; access is through methods that enforce rules.
- [ ] The entity is fully testable without mocks or infrastructure.
- [ ] Value objects are immutable (`readonly` fields, a frozen dataclass, a struct passed by value).
- [ ] Entity identity is explicit (not reliant on database auto-increment exposed in the domain layer).

## SRP Check
- Ask: "What is the ONE reason this entity would change?"
- Answer should be: "When the enterprise business rules around `<EntityName>` change."
- If the entity changes for UI reasons, DB reasons, or use case reasons → violation.

## Output
After creating files, show:
1. The entity structure with a brief explanation of each field/method.
2. Which business rules are enforced at the entity level.
3. Suggested tests to write.
4. Any value objects identified for extraction.
