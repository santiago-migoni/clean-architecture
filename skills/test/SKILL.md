---
name: test
description: "This skill should be used when the user asks to \"write tests for an entity / use case / presenter / gateway / controller\", \"add integration tests for a repository\", \"add e2e tests\", or wants tests that respect the Test Boundary, laid out as tests/<module>/{unit,integration} and tests/e2e (Clean Architecture Chapter 28)."
argument-hint: "<module>/<Name>"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to create tests that comply with the **Test Boundary** principle.

The argument after the command is `<module>/<Name>` of the class/use case/entity to test (e.g., `orders/PlaceOrderInteractor`, `orders/Order`, `orders/OrderGateway`). Unit tests mirror the source tree (`tests/<module>/unit/{domain,application,infrastructure}/`); integration tests can only be gateway tests against a real database, so they sit flat in `tests/<module>/integration/`; e2e tests go to `tests/e2e/`. **Go is the exception:** tests are `<file>_test.go` beside the code they test, in the same package; gateway tests against a real database carry `//go:build integration` (run with `go test -tags integration ./...`); e2e tests live in `cmd/<app>/`.

## The Test Boundary (Chapter 28)

From the book:
> "Tests are not outside the system; rather, they are parts of the system that must be well designed and well managed. Tests that are strongly coupled to the system are fragile — they break whenever any part of the system changes."

Key principles:
1. **Tests follow the Dependency Rule** — tests are in the outermost circle; nothing in the system depends on tests.
2. **Tests must be isolated** — use case tests must not touch the DB, HTTP, or any framework.
3. **Tests should be fragile-free** — don't test implementation details; test behavior through interfaces.
4. **Test API** — create a specific API for tests that lets the system be put into a testable state without going through the production UI.
5. **Tests follow the Module Rule too** — a test of module A must not import module B's `domain/` or `infrastructure/`. Fake the cross-module port instead (see Test Type 2).

## Test Pyramid in Clean Architecture

```
                  /\
                 /  \
                / E2E \        ← Few, slow, fragile
               /      \          (tests the whole system through the UI/HTTP)
              /────────\
             /Integration\    ← Moderate, tests gateway/adapter wiring
            /            \       (uses real DB, but in-memory or test schema)
           /──────────────\
          /   Unit Tests   \  ← Many, fast, pure
         /  (entities &     \    (no I/O, no framework, no mocks of inner layers)
        /   use cases)       \
       /─────────────────────\
```

## Your Task

Determine the type of target (entity, use case, presenter, gateway, controller, cross-module gateway) and generate the matching test where the language puts it.

**Before writing code, read the references.** The test of each piece is in that piece's skill reference, next to the code it tests; the cross-cutting tests and the test configuration are in this skill's reference:

| Target | Example test in |
|---|---|
| Entity | `entity` skill reference |
| Use case interactor | `usecase` skill reference |
| Presenter | `presenter` skill reference |
| Controller | `controller` skill reference |
| Gateway (integration) | `gateway` skill reference |
| Configuration, cross-module gateway, repository contract, presenter-per-request, HTTP e2e | this skill: [TypeScript / JavaScript](references/typescript.md), [Python](references/python.md), [Go](references/go.md) |

For another language, apply the same structure with its test framework.

### Test Type 1: Entity Tests
Pure: zero mocks, zero I/O. One test per business rule and per invariant (invalid state is rejected with the domain error), plus equality.

### Test Type 2: Use Case Interactor Tests
An in-memory repository and fakes for the outbound ports; never a real database or HTTP. The other module is faked through **this module's own port** (`CustomerLookup`), never by importing the other module. Cover the happy path, each declared failure (and that nothing was persisted), and the order of checks (a malformed request fails before another module is asked).

**Variant with an Output Port** (only if the use case has one): the interactor returns nothing; fake the port and assert on what was presented, and assert that an unexpected failure is rethrown, not presented.

### Test Type 3: Presenter Tests (only if the use case has a Presenter)
No HTTP stack. One test per formatting rule, one per typed error (code and message), and one proving an unexpected error gets the generic message.

### Test Type 4: Gateway Integration Tests
Against a real (test) database, with the module's migrations applied: round-trip, not found, and the conflict (a different row with the same unique value fails with the port's error and the first row survives).

### Test Type 5: Controller Tests
The use case is replaced by a fake; no server. Assert the mapping of each typed failure to its status, and that an unexpected failure propagates.

### Test Type 6: Cross-Module Gateway Tests
Fake only the other module's **input port**, and assert that the gateway translates its answer into this module's vocabulary.

### Test Type 7: Guards that a happy-path test cannot give (verified on a running example)
- **Repository contract tests.** Run the same conflict/not-found scenarios against the real gateway (integration) and the in-memory one (unit), and assert that **pre-existing data survives a failed save** — this is what exposes `INSERT OR REPLACE`.
- **Deterministic isolation tests for stateful collaborators.** If the composition root builds a presenter per request, test the factory (two calls return two different presenters; an interleaved pair keeps its own state). Do not rely on a concurrency test over a synchronous stack: with in-memory repositories or an embedded database, requests never interleave, so a *shared* presenter still passes. Prove any such test with a **mutation check**: break the code on purpose and confirm the test fails.
- **HTTP e2e through both composition roots.** Run the same scenarios over the production root (real database) and the test root (in-memory). Assert status AND body, and include malformed input, an unknown id, a duplicate and a validation failure.

## Validation Checklist

- [ ] Unit tests for entities: zero mocks, zero I/O, test all business rules.
- [ ] Unit tests for use cases: in-memory repository and fakes for outbound ports (mock the Output Port only if the use case has one).
- [ ] Use case tests do NOT connect to a real database.
- [ ] Integration tests are in a separate directory and test suite.
- [ ] Presenter tests (if a Presenter exists) run without starting an HTTP server.
- [ ] A test of one module never imports another module's `domain/` or `infrastructure/` (cross-module ports are faked).
- [ ] Controller tests mock the use case interface.
- [ ] No business logic is tested only in integration or e2e tests.
- [ ] Every guard test was proven with a mutation check (the code was broken on purpose and the test failed).
- [ ] Test files themselves follow the Dependency Rule and the Module Rule (test code can only import from inner layers of the module under test + test utilities).

## Output
After creating test files, provide:
1. Test coverage breakdown by layer.
2. Which tests need infrastructure (DB, network) and which don't.
3. How to run only the fast unit tests (`vitest run tests/*/unit`, `pytest tests/*/unit`, `go test ./...` without the `integration` tag).
