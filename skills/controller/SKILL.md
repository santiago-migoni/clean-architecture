---
name: controller
description: "This skill should be used when the user asks to \"create a controller\", \"add an HTTP endpoint\", \"map a request to a use case\", \"map typed errors to HTTP status codes\", or to review an interface adapter in a module's infrastructure/controllers/ (The Web is a Detail)."
argument-hint: "<module>/<Name>"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or review a **Controller** — part of the Interface Adapters layer.

The argument after the command is `<module>/<Name>` (e.g., `orders/PlaceOrder`, `customers/RegisterCustomer`); the controller class is `<Name>Controller`. The module selects the folder under `modules/`. If the project has a single module the prefix may be omitted.

## What is a Controller?

From the book (Chapter 22 — The Clean Architecture):
> "The software in the interface adapters layer is a set of adapters that convert data from the format most convenient for the use cases and entities, to the format most convenient for some external agency such as the Database or the Web."

A Controller:
- Lives in the **Interface Adapters** layer (the module's `infrastructure/controllers/`).
- Converts **framework input** (HTTP request, CLI args, message queue payload, gRPC call) → **Use Case Input Model** (a plain data object).
- Calls the use case: through the **Input Port** if the module defines one, otherwise directly on the module's **interactor** (same module, dependency still points inward).
- Does NOT process business logic.
- Maps the use case's **response model** to the delivery answer (HTTP status + JSON). If the use case has an Output Port, the Presenter does the formatting and the controller does not touch the response.
- Knows about the delivery framework (Express, FastAPI, `net/http`) but keeps that knowledge confined here.

## Data Flow

Default (no Output Port):
```
[Framework Request] → Controller (infrastructure/controllers/)
      ↓ builds RequestModel (plain object)
  Interactor (application/interactors/)   — or its Input Port (application/ports/input/) when one exists
      ↓ returns ResponseModel
  Controller maps ResponseModel → HTTP response
```

With an Output Port:
```
[Framework Request] → Controller → [Input Port] → Interactor
      ↓ calls Output Port
  Presenter (infrastructure/presenters/)
      ↓
  View Model / HTTP Response
```

## Your Task

### Step 1: Identify what the controller calls
- If the module has an Input Port for the use case (`application/ports/input/`), depend on that interface (required when another module or a second entry point also calls the use case).
- Otherwise depend on the interactor in `application/interactors/`. Do not create an Input Port just for the controller. (In Go, the controller declares the small interface it needs and the interactor satisfies it.)

### Step 2: Check for a Presenter
Only if the use case has an Output Port, pair the controller with its Presenter (see the `presenter` skill). Otherwise the controller maps the returned response model itself.

### Step 3: Create the Controller

In the module's `infrastructure/controllers/`, named per "Language conventions" in the `rules` skill.

**Before writing code, read the reference for the project's language.** Each one has the default-style controller, the variant with an Output Port, the route registration and last-resort handler in `platform/web/`, and the controller test:

- [TypeScript / JavaScript](references/typescript.md) — Express
- [Python](references/python.md) — a framework-free controller, with a FastAPI route
- [Go](references/go.md) — `net/http`

For another language or framework, apply the same structure with its idioms.

The controller:
1. **Coerces** the framework input into the use case's request model (primitive fields only; no framework object crosses into `application/`).
2. **Calls** the use case (Input Port or interactor, Step 1).
3. **Maps** the response model to the delivery answer — or, with an Output Port, does nothing more: the presenter formats and a thin route handler in `platform/web/` sends it.

### Step 4: Define the HTTP Request DTO (if needed)
Keep the HTTP request schema (the body exactly as it arrives) separate from the use case request model, beside the controller. Translate vocabulary there (HTTP `items` → request `lines`), so the API can change without touching the use case.

### Step 5: Wire in the composition root (reminder)
The controller does NOT build its own use case: the composition root does. Note which dependencies it needs. Route registration lives in `platform/web/` (it may import the module's controllers; the controller never imports `platform/`).

### Step 6: Error mapping and HTTP details (verified on a running example)
- **Map known, typed failures; never match on message text.** Each typed error the use case declares gets a status: invalid (domain error) → 400, not found → 404, conflict → 409.
- **Never swallow the rest.** An error you do not recognise propagates to the last-resort handler in `platform/web/`, which logs it and answers 500 without leaking internals.
- **Coerce, do not validate business rules.** Converting to strings and numbers keeps a malformed body from crashing the controller; the entity then rejects empty or invalid values with its own typed error.
- **Malformed input** (unparseable JSON) is the client's fault: 400, answered by the framework layer or the controller, never 500.
- With an **Output Port**, the controller never receives the response object.

## Validation Checklist

- [ ] Controller lives in the module's `infrastructure/controllers/` (or, in Go, a technology-named subpackage of `infrastructure/`).
- [ ] Controller does not import `platform/`, the composition root, or another module.
- [ ] Controller depends on the Input Port if the module defines one, otherwise on its own module's interactor — never on another module's classes.
- [ ] No business logic in the controller — only data translation (request in, response model → HTTP out, errors → status codes).
- [ ] If the use case has an Output Port, the controller does NOT write the response — the Presenter and the thin route handler do.
- [ ] Known failures are mapped by type to a status; unknown ones propagate, never swallowed or converted into a generic 400.
- [ ] Framework objects (requests, responses, contexts of the web framework) do NOT leak into the use case layer.
- [ ] Controller receives the use case through its constructor (for testability).
- [ ] Input validation in the controller is limited to HTTP-level concerns (required fields, type coercion); business validation stays in the use case/entity.

## SRP Check
- The controller has one reason to change: when the **HTTP interface contract** changes (e.g., a field is renamed in the API).
- It does NOT change when business rules change (that's the interactor) or when the response format changes (that's the presenter).

## Output
After creating files, show:
1. What fields are extracted from the framework request.
2. How they map to the Use Case Request Model.
3. What the controller does NOT do (to clarify boundaries).
4. How to test the controller in isolation (mock the use case input port).
