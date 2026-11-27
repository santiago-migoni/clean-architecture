---
name: presenter
description: "This skill should be used when the user asks to \"create a presenter\", \"add a view model\", \"format a use case output\", \"apply the Humble Object pattern\", or needs an Output Port implementation in a module's infrastructure/presenters/ (Clean Architecture Chapter 23). It first checks whether a presenter is justified at all."
argument-hint: "<module>/<Name>"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create or review a **Presenter** using the **Humble Object Pattern**.

The argument after the command is `<module>/<Name>` (e.g., `orders/PlaceOrder`, `customers/UserProfile`); the presenter class is `<Name>Presenter`. The module selects the folder under `modules/`. If the project has a single module the prefix may be omitted.

## When to use a Presenter (it is optional)

By default a use case returns a response model and the controller maps it to the HTTP answer — no Presenter needed. Add a Presenter + Output Port only when:
- Formatting the output is non-trivial (currency, dates, labels, localisation) and you want that logic unit-testable without an HTTP stack, or
- Several delivery mechanisms (web, CLI, PDF, …) need different views of the same response.

If neither is true, tell the user a Presenter is not justified yet and stop.

## What is a Presenter?

From the book (Chapter 23 — Presenters and Humble Objects):
> "The Humble Object pattern is a design pattern that was originally identified as a way to help unit testers to separate behaviors that are hard to test from behaviors that are easy to test."

The Presenter:
- Lives in the **Interface Adapters** layer (the module's `infrastructure/presenters/`).
- Implements the **Output Port interface** (defined in the module's `application/ports/output/`).
- Receives the Use Case **Response Model** (plain data object) from the interactor.
- Converts it into a **View Model** — data formatted for display/HTTP response.
- Is called by the **Interactor** — the use case pushes data to the presenter (not the other way around).
- Contains the **testable formatting logic**.
- The **View** (the Humble Object) simply renders whatever the Presenter prepares — with zero logic.

## The Humble Object Pattern Split

```
Use Case Response Model (plain data)
          ↓
     [PRESENTER]  ← This is the TESTABLE part
  Implements Output Port
  Formats data into View Model
  Handles error states
          ↓
     [VIEW MODEL]  ← Plain data structure
          ↓
     [VIEW / HTTP Response]  ← HUMBLE OBJECT (untestable, thin)
  Just renders the View Model
  No logic here
```

## Why This Matters
Without this pattern, the View mixes formatting logic (testable) with rendering (hard to test). By splitting them, the Presenter becomes fully unit-testable without a browser or HTTP stack.

## Your Task

### Step 1: Verify the Output Port Interface
Check the module's `application/ports/output/` for the use case's Output Port. The Presenter implements it.

If it does not exist yet, create it now (`present(response)` + `presentError(error)`), change the interactor so it returns nothing and calls the Output Port instead of returning the response model, and update the interactor test (see the `usecase` skill, Step 4).

**Before writing code, read the reference for the project's language.** Each one has the view model, the presenter, the humble route handler in `platform/web/` and the presenter test, for the `PlaceOrder` use case of the `orders` module:

- [TypeScript / JavaScript](references/typescript.md)
- [Python](references/python.md)
- [Go](references/go.md)

For another language, apply the same structure with its idioms. Names follow "Language conventions" in the `rules` skill.

### Step 2: Define the View Model
Beside the presenter, in the module's `infrastructure/presenters/`. Plain data, no methods: fields formatted for display (`'$42.00'` instead of `4200` cents, `'Pending'` instead of `'PENDING'`, a formatted date instead of a date object). Add an **error view model** with one **code** per typed error the use case reports, plus `UNKNOWN_ERROR`; make the code a closed set the compiler or type checker can verify (a string-literal union, a `Literal`, typed constants).

### Step 3: Create the Presenter (Testable Part)
In the module's `infrastructure/presenters/`. It stores the view model in `present` and the error view model in `presentError`, and exposes them (plus `hasError`) to the view. All formatting logic lives here.

### Step 4: Create the View (Humble Object — thin route handler)
In `platform/web/` (platform may import the module's adapters; the adapters never import `platform/`). It gets a factory that returns a NEW presenter and its controller, runs the controller, and sends the presenter's view model — or the error view model with the HTTP status from a code → status table. No other logic.

### Step 5: Create Presenter Tests (no HTTP stack needed)
Where the language puts unit tests. One test per formatting rule, one per typed error (its code and message), one in a second locale, and one proving an unexpected error is shown with the generic message.

### Step 6: Error codes, status mapping and isolation (verified on a running example)
- **Typed errors → codes**, by type (`instanceof`, `isinstance`, `errors.As`/`errors.Is`) and reason, never by message text.
- **Text in the request's language.** The presenter receives the locale (negotiated by `platform/web/`) and a translator (injected by the composition root) and writes every label and message from the module's catalog, beside it. The use case returns codes; it never knows the language.
- **Never leak an unexpected failure.** For `UNKNOWN_ERROR` the view model carries a generic message (`'Unexpected error'`), not the error's own message (driver errors, table names, stack details).
- **Status mapping belongs to the humble route handler** in `platform/web/`, as a table from error code to HTTP status. The presenter stays free of HTTP knowledge.
- **A presenter is stateful, so the composition root must build one per request.** Test this deterministically on the factory (two calls return two different presenters, and an interleaved pair keeps its own state). A concurrency test over a synchronous stack (an in-memory repository, an embedded database) can NOT detect a shared presenter — requests never interleave — and gives false confidence.

## Validation Checklist

- [ ] Presenter lives in the module's `infrastructure/presenters/`.
- [ ] Presenter implements the Output Port interface from the module's `application/ports/output/`.
- [ ] Presenter does NOT import from `platform/`, the composition root, another module, or any HTTP library.
- [ ] View Model is a plain data structure with NO methods.
- [ ] All formatting logic is in the Presenter (testable), NOT in the View (Humble Object).
- [ ] The HTTP handler / View is as thin as possible — no conditional business logic.
- [ ] Presenter is unit-testable without starting an HTTP server.
- [ ] Error paths are handled (presentError is implemented), by type, with a generic message for unknown failures.
- [ ] Every text comes from the module's catalog, in the request's locale; the catalog provides every locale the app speaks.
- [ ] The composition root builds a new presenter per request, guarded by a deterministic factory test.

## SRP Check
- The Presenter changes only when the **display format** of `<Name>` changes.
- It does NOT change when the HTTP library changes (that's the View/route) or when business rules change (that's the interactor/entity).

## Output
After creating files, show:
1. The Humble Object split: what's testable vs. what's humble.
2. The mapping from Response Model fields → View Model fields.
3. How to test the presenter in isolation.
