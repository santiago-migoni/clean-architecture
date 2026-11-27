---
name: usecase
description: "This skill should be used when the user asks to \"create a use case\", \"add an interactor\", \"add a repository port\", \"add an input port or output port\", \"call another module from a use case\", or to review application business rules in a module's application/ folder (Clean Architecture Chapters 20 and 22)."
argument-hint: "<module>/<UseCaseName>"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or review a **Use Case** — the Application Business Rules layer (the `application/` layer of a module).

The argument after the command is `<module>/<UseCaseName>` (e.g., `orders/PlaceOrder`, `customers/RegisterCustomer`, `billing/ProcessPayment`). The module selects the folder under `modules/`. If the project has a single module the prefix may be omitted.

## What is a Use Case?

From the book (Chapter 20 — Business Rules):
> "Use cases contain the rules that specify how and when the Critical Business Rules within the Entities are invoked. Use cases control the dance of the Entities."

Use Cases are:
- **Application-specific** business rules (not enterprise-wide — those belong in the domain).
- Orchestrators that direct entities to perform their critical business rules.
- **Independent of UI, DB, frameworks** — a use case should work with a command-line, a REST API, or a batch job.

## Keep it as small as the use case allows

A use case has ONE required file — the interactor — plus the repository interface it needs. Everything else is opt-in. Create the extra pieces only when their trigger is true; never scaffold them "just in case".

| Piece | Required? | Create it when |
|---|---|---|
| Interactor (`application/interactors/<use-case>`) | Always | — |
| Request / Response models | Always (in the interactor file) | — |
| Repository / outbound port (`application/ports/output/<x>`) | When the use case touches data or the outside | — |
| **Input Port** (`application/ports/input/<use-case>`) | Optional | Another module calls this use case, or there is a second entry point (HTTP + CLI/queue), or you want to swap the interactor behind the controller |
| **Output Port + Presenter** | Optional | Formatting the output is non-trivial (currency, dates, labels), or several delivery mechanisms need different views |
| Cross-module port (`application/ports/output/<other>-lookup`) | Only for cross-module needs | The use case needs something owned by another module |

The Dependency Rule is not weakened by skipping the Input Port: a controller in the same module that depends on the interactor still points inward (infrastructure → application). The inversion that is NOT optional is the one for outbound dependencies (repository, payment, clock…): the interactor depends on an interface, never on the implementation.

All paths below are inside the module's folder (`modules/<module>/` under the language's code root).

## Default flow (no Input Port, no Presenter)

```
Controller ──▶ Interactor ──▶ Repository interface (application/ports/output/) ◀── Gateway (infrastructure/gateways/)
                  │
                  ▼
              Entities (domain/)
                  │
                  ▼ returns ResponseModel
Controller maps ResponseModel → HTTP response
```

## Flow with the optional pieces

```
Controller → [Input Port] → Interactor → [Output Port] → Presenter → ViewModel
                                 ↓
                             Entities   → Repository interface → Gateway
```

## Your Task

**Before writing code, read the reference for the project's language.** Each one shows the same `orders`/`customers` example, complete and idiomatic: an interactor in the default flow, the output ports, an application error, an input port, the cross-module port, the Output Port variant and the use case test.

- [TypeScript / JavaScript](references/typescript.md)
- [Python](references/python.md)
- [Go](references/go.md)

For a language without a reference, apply the same structure with its idioms. File and folder names follow "Language conventions" in the `rules` skill.

### Step 1: Create the Interactor (required)
In the module's `application/interactors/`. It:
- receives every dependency through its constructor (DIP): the ports it needs, and anything nondeterministic (id generator, clock);
- takes a **request model** and returns a **response model**, both plain data with primitive fields — no domain objects, no framework objects;
- follows the sequence: build or load entities (enterprise rules run there), apply the application rules, persist through the repository port, return the response;
- throws (or returns, in Go) typed errors; the controller or presenter maps them to a delivery-specific answer.

### Errors: typed, in the layer that owns the rule
Failures are **typed errors** so the outer layers can map them without parsing messages:
- **Enterprise rule** broken by an entity → a domain error, raised by the entity itself (`InvalidOrderError`, `ErrInvalidOrder`).
- **Application failure** of the use case (a needed record is missing, a conflict) → an application error in the module's `application/` (`CustomerNotFoundError`, `EmailAlreadyRegisteredError`). Create it with the first one.
A generic error for a rule the caller must react to is a smell: the controller or presenter would have to match on text. An error carries codes and data, never text for users: the outer layers write that, in the user's language.

### Step 2: Define the Repository Interface (if data access is needed)
In the module's `application/ports/output/`, one file per port.

**Important**: this interface is defined in the `application` layer, not in `infrastructure`. That is the Dependency Inversion Principle: the use case defines what it needs; the gateway implements it. Declare only the methods this module's use cases call.

### Step 3 (optional): Input Port
Create it only if its trigger is true (another module calls the use case, a second entry point exists, or the interactor must be swappable). It goes in `application/ports/input/` and holds the request/response models and the use case interface; the interactor implements it.

This is the module's **public surface**: the only thing another module's infrastructure may import. Keep it free of domain objects.

### Step 4 (optional): Output Port + Presenter
Create them only if output formatting is non-trivial. The interactor then returns nothing and calls the Output Port: `present` on success, `presentError` for the failures it declares, and it rethrows anything else (a database failure, a bug) instead of presenting it. Define the **response model in the Output Port file** when the interactor imports the port, so the two never import each other.

Then run `/clean-architecture:presenter <module>/<UseCaseName>`.

### Step 5: Need data or behaviour from another module?
Never import the other module's `domain/` or `infrastructure/`. Use the cross-module recipe:

1. **Declare a port owned by this module**, in this module's vocabulary, in `application/ports/output/` (for example `CustomerLookup` with `exists(customerId)`).
2. **Implement it in this module's `infrastructure/`** by calling the other module's *input port* (which therefore must exist — create it in the other module, Step 3). See the `gateway` skill: this is the only place allowed to import `<other>/application/ports/input/`.
3. **Reference the other module's entities by id** in this module's domain (`customerId`).
4. Wire both sides in the composition root.

### Step 6: Create Use Case Tests
Where the language puts unit tests (`tests/<module>/unit/application/` in TypeScript and Python, a `_test.go` beside the interactor in Go).

**Test strategy**: stubs or an in-memory repository — never the real database or HTTP. Fake the other module through this module's own port, never by importing it. Create the in-memory repository with the `gateway` skill the first time a test needs one. Cover the happy path, each declared failure (and that nothing was persisted), and, with an Output Port, that an unexpected failure is rethrown rather than presented.

## Validation Checklist

- [ ] The interactor imports ONLY from its own module's `domain/` and `application/`, plus `shared/` — never from `infrastructure/`, `platform/`, the composition root, or another module.
- [ ] The Repository interface is defined in `application/ports/output/` (NOT in `infrastructure/`).
- [ ] An Input Port exists only if one of its triggers is true; if another module calls the use case, it exists in `application/ports/input/`.
- [ ] An Output Port / Presenter exists only if output formatting justifies it.
- [ ] Anything needed from another module goes through a port owned by this module (Step 5), never a direct import.
- [ ] The interactor receives all dependencies through its constructor (DIP).
- [ ] The use case takes only the request model — no HTTP request objects, no ORM entities.
- [ ] Application-level validation is in the interactor; enterprise rules are delegated to entities.
- [ ] Tests use stubs or in-memory implementations; the suite runs without a database.

## SRP Check
- The interactor has one reason to change: when the APPLICATION BUSINESS RULES for `<UseCaseName>` change.
- It does NOT change because the DB changes (gateway changes), or the UI changes (controller/presenter changes).

## Output
After creating files, show:
1. The data flow for this use case (default flow, or the flow with the optional pieces actually created).
2. Which entity methods are invoked.
3. What the response model contains.
4. Which optional pieces were created and which trigger justified each.
5. Any cross-module port introduced and where it is implemented.
6. Suggested edge cases to test.
