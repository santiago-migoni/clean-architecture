---
name: usecase
description: "This skill should be used when the user asks to \"create a use case\", \"add an interactor\", \"add a repository port\", \"add an input port or output port\", \"call another module from a use case\", or to review application business rules in src/modules/<module>/application/ (Clean Architecture Chapters 20 and 22)."
argument-hint: "<module>/<UseCaseName>"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or review a **Use Case** — the Application Business Rules layer (the `application/` layer of a module).

The argument after the command is `<module>/<UseCaseName>` (e.g., `orders/PlaceOrder`, `customers/RegisterCustomer`, `billing/ProcessPayment`). The module selects the folder under `src/modules/`. If the project has a single module the prefix may be omitted.

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

All paths below are inside `src/modules/<module>/`.

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

### Step 1: Create the Interactor (required)
File: `src/modules/<module>/application/interactors/<use-case-name>.<ext>`

```typescript
// TypeScript
// Layer: application (Application Business Rules)
// May import from: this module's domain/, this module's application/ports/, src/shared/
// May NOT import from: infrastructure/, platform/, main/, or any other module
// Dependencies injected via constructor (DIP)

import { I<Domain>Repository } from '../ports/output/<domain>-repository';

export interface <UseCaseName>Request {
  // Primitive types only — no domain objects, no framework objects
}

export interface <UseCaseName>Response {
  // Plain data produced by the use case
}

export class <UseCaseName>Interactor {
  constructor(private readonly repository: I<Domain>Repository) {}

  async execute(request: <UseCaseName>Request): Promise<<UseCaseName>Response> {
    // 1. Validate input (application-level validation, not enterprise rules)
    // 2. Retrieve entities via the repository
    // 3. Invoke entity business rules
    // 4. Persist changes via the repository
    // 5. Return the response model
    // Failures are thrown as domain/application errors; the controller maps them to a delivery-specific answer.
    throw new Error('not implemented');
  }
}
```

```python
# Python — src/modules/<module>/application/interactors/<use_case_name>.py
# Layer: application (Application Business Rules)
from dataclasses import dataclass
from ..ports.output.<domain>_repository import I<Domain>Repository

@dataclass
class <UseCaseName>Request:
    pass  # primitive fields only

@dataclass
class <UseCaseName>Response:
    pass

class <UseCaseName>Interactor:
    def __init__(self, repository: I<Domain>Repository):
        self._repository = repository

    def execute(self, request: <UseCaseName>Request) -> <UseCaseName>Response:
        # 1. Validate, 2. Load entities, 3. Apply rules, 4. Save, 5. Return the response
        raise NotImplementedError
```

### Errors: typed, in the layer that owns the rule
Failures are thrown as **typed errors** so the outer layers can map them without parsing messages:
- **Enterprise rule** broken by an entity → `domain/errors/invalid-<entity>-error.<ext>` (thrown by the entity itself).
- **Application failure** of the use case (a needed record is missing, a conflict) → `application/errors/<name>-error.<ext>` (for example `CustomerNotFoundError`, `EmailAlreadyRegisteredError`). Create the folder when the first one exists.
Plain `Error` for a rule the caller must react to is a smell: the controller/presenter would have to match on text.

### Step 2: Define the Repository Interface (if data access is needed)
File: `src/modules/<module>/application/ports/output/<domain>-repository.<ext>`

**Important**: This interface is defined in the `application` layer, not in `infrastructure`. This is the Dependency Inversion Principle in action — the use case defines what it needs; the gateway (infrastructure) implements it. Only declare the methods this module's use cases actually call.

```typescript
// TypeScript
import { <Entity> } from '../../../domain/<entity-name>';

export interface I<Domain>Repository {
  findById(id: string): Promise<<Entity> | null>;
  save(entity: <Entity>): Promise<void>;
  // ... other query methods needed by THIS use case
}
```

### Step 3 (optional): Input Port
Create it only if its trigger is true (another module calls it, a second entry point exists, or you need to swap the interactor).

File: `src/modules/<module>/application/ports/input/<use-case-name>.<ext>` — move `<UseCaseName>Request`/`Response` here and make the interactor `implements I<UseCaseName>UseCase`:

```typescript
export interface I<UseCaseName>UseCase {
  execute(request: <UseCaseName>Request): Promise<<UseCaseName>Response>;
}
```
This file is the module's **public surface**: it is the only thing another module's infrastructure may import. Keep it free of domain objects.

### Step 4 (optional): Output Port + Presenter
Create them only if output formatting is non-trivial. The interactor then returns `Promise<void>` and calls the Output Port (`present` on success, `presentError` in a `catch`). Define the **response model in the Output Port file** (the interactor imports it) — defining it in the interactor file would make the port and the interactor import each other:

File: `src/modules/<module>/application/ports/output/<use-case-name>-output.<ext>`
```typescript
export interface I<UseCaseName>OutputPort {
  present(response: <UseCaseName>Response): void;
  presentError(error: Error): void;
}
```
Then run `/clean-architecture:presenter <module>/<UseCaseName>`.

### Step 5: Need data or behaviour from another module?
Never import the other module's `domain/` or `infrastructure/`. Use the cross-module recipe:

1. **Declare a port owned by this module**, expressed in this module's own vocabulary:
   `application/ports/output/<other>-lookup.<ext>`
   ```typescript
   export interface ICustomerLookup {
     exists(customerId: string): Promise<boolean>;
   }
   ```
2. **Implement it in this module's `infrastructure`** by calling the other module's *input port* (which therefore must exist — create it in the other module, Step 3):
   `infrastructure/gateways/<other>-lookup-gateway.<ext>`
   (see the `gateway` skill — this is the only place allowed to import `src/modules/<other>/application/ports/input/`).
3. **Reference the other module's entities by id** in this module's domain (`customerId: string`).
4. Wire both sides in `src/main/`.

### Step 6: Create Use Case Tests
File: `tests/<module>/unit/application/<use-case-name>.test.<ext>`

**Test strategy**: Use stubs or an in-memory repository — never touch the real DB or HTTP. (Create the in-memory repository with the `gateway` skill the first time a test needs one.)

```typescript
describe('<UseCaseName>Interactor', () => {
  let interactor: <UseCaseName>Interactor;
  let mockRepository: jest.Mocked<I<Domain>Repository>;

  beforeEach(() => {
    mockRepository = { findById: jest.fn(), save: jest.fn() };
    interactor = new <UseCaseName>Interactor(mockRepository);
  });

  it('should [describe happy path]', async () => {
    const response = await interactor.execute({ /* ... */ });
    // assert on the response and on repository.save
  });

  it('should throw when [failure condition]', async () => {
    await expect(interactor.execute({ /* ... */ })).rejects.toThrow();
  });
});
```
With an Output Port, replace the response/throw assertions with `expect(outputPort.present).toHaveBeenCalledWith(...)` / `presentError`.

## Validation Checklist

- [ ] The interactor imports ONLY from its own module's `domain/` and `application/ports/`, plus `src/shared/` — never from `infrastructure/`, `platform/`, `main/`, or another module.
- [ ] The Repository interface is defined in `application/ports/output/` (NOT in `infrastructure/`).
- [ ] An Input Port exists only if one of its triggers is true; if another module calls the use case, it exists in `application/ports/input/`.
- [ ] An Output Port / Presenter exists only if output formatting justifies it.
- [ ] Anything needed from another module goes through a port owned by this module (Step 5), never a direct import.
- [ ] The interactor receives all dependencies via constructor injection (DIP).
- [ ] `execute` uses only the request model — no HTTP request objects, no ORM entities.
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
