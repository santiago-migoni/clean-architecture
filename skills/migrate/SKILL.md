---
name: migrate
description: "This skill should be used when the user asks to \"migrate to Clean Architecture\", \"refactor a big ball of mud\", \"extract entities / use cases / gateways from existing code\", \"move to the feature-first module layout\", or to convert the previous layer-first layout (src/entities, src/usecases, src/adapters) into src/modules/<module>/{domain,application,infrastructure} (Clean Architecture Chapter 34)."
argument-hint: "[path]"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to **migrate existing code** toward Clean Architecture.

The argument after the command is the path to the code to migrate (e.g., `src/`, `src/orders/`, a specific file).

## Migration Philosophy

From the book (Chapter 34 — The Missing Chapter):
> "The devil is in the implementation details."

The target layout is feature-first: `modules/<module>/{domain,application,infrastructure}` plus `shared/`, `platform/` and the composition root, under the language's code root (`src/` in TypeScript, `src/<package>/` in Python, `internal/` + `cmd/` in Go — see "Language conventions" in the `rules` skill).

Migration should be:
- **Incremental** — never a big-bang rewrite. Migrate one module at a time, and within it one layer at a time.
- **Non-breaking** — existing tests should still pass after each step.
- **Inside-out** — start with the innermost layer (entities) and work outward.
- **Test-driven** — add tests before moving code, so the tests validate the migration.

## Common Starting Points (Anti-Pattern Recognition)

Before migrating, identify the current architecture anti-pattern:

### 1. Transaction Script (Procedural)
```
// Everything in one function/handler
router.post('/orders', async (req, res) => {
  const { customerId, items } = req.body;
  // validate inputs
  // query database directly
  // apply business logic
  // format and send response
  // Everything mixed together
});
```

### 2. Active Record
```
// Models that know how to save themselves (Rails, Django ORM)
class Order extends ActiveRecord {
  async placeOrder() {
    this.status = 'placed';
    await this.save(); // domain object knows about DB
  }
}
```

### 3. Anemic Domain Model
```
// Data objects with no behavior
class Order { id: string; items: Item[]; status: string; }
// All logic in "service" classes that directly import Order
class OrderService {
  async placeOrder(dto: PlaceOrderDto, orderRepo: any) { ... }
}
```

### 4. Big Ball of Mud
```
// Imports everywhere, no clear layers
// controllers import from models import from utils import from controllers
```

### 5. Previous layer-first Clean Architecture layout
```
// src/entities/, src/usecases/, src/adapters/, src/frameworks/, src/main/
// Layers are right, but every business capability is mixed inside each layer folder
```
Mapping (per module): `entities/<x>` → `modules/<m>/domain/`, `usecases/ports|interactors` → `modules/<m>/application/`, `adapters/*` → `modules/<m>/infrastructure/`, `frameworks/*` → `platform/`. File names become kebab-case. Start with Phase 0 (identify the modules), then move the files of one module at a time and fix imports; `ca_scan` reports files still in the old folders.

### 6. Folder names of plugin versions before 2.0
```
// src/modules/<m>/app/...                                  → src/modules/<m>/application/...
// src/modules/<m>/infra/adapters/{controllers,presenters,gateways}/ → src/modules/<m>/infrastructure/{controllers,presenters,gateways}/
```
Only a rename: the layers and the rules are the same, so skip the roadmap below. Per module: `git mv` the folders (also `tests/<m>/unit/app` and `tests/<m>/unit/infra/adapters/*`; the files of `tests/<m>/integration/infra/adapters/gateways/` move up to `tests/<m>/integration/`), then fix every import that points into them (relative imports out of `infrastructure/` lose one `../`), the paths in `main/`, and the lint config (`app` → `application`, `infra` → `infrastructure` in element patterns). Done when `ca_scan` shows no "before 2.0" warning and the typecheck, lint and tests pass.

## Migration Roadmap

Every phase keeps the application working: the old code first delegates to the new piece and is deleted only when nothing calls it any more. **For before/after code of each phase in the project's language, read** [TypeScript / JavaScript](references/typescript.md), [Python](references/python.md) or [Go](references/go.md). Paths below are inside the module's folder under the language's code root (see "Language conventions" in the `rules` skill).

### Phase 0: Identify the Modules (Planning Only — No Code Moves)

**Goal**: Decide the module boundaries before moving any code.

Steps:
1. List the business capabilities in the code (`orders`, `customers`, `billing`…). Group by *reason to change* (CCP), not by technical type: a module is what changes together.
2. Name each module in kebab-case. Avoid the reserved names `shared`, `platform`, `main`, `domain`, `application`, `infrastructure`, `modules`, `bootstrap` and `composition` (aliases of `main`), plus `app`, `infra` and `adapters` (layer folders of versions before 2.0).
3. Map every existing class/file to a module. Anything used by several modules and free of business policy (Money, Id, base errors) is a candidate for `shared/`.
4. Find the places where one capability calls another. Each becomes a **cross-module port** (owned by the caller, implemented in the caller's `infrastructure`, calling the other module's input port) — decide them now.
5. Order the migration: start with the module that is depended on the least.

Phases 1–5 below are applied **per module**.

### Phase 1: Extract Entities (Safest — No Behavior Change)

**Goal**: Pull pure business logic out of service classes, controllers, or models.

Steps:
1. Identify classes/functions that contain enterprise business rules.
2. Create the module's `domain/` folder.
3. Create entity classes that:
   - Are framework-independent.
   - Contain only business methods and validation.
   - Have NO database operations, NO HTTP concerns.
4. Have the existing service/model DELEGATE to the entity.
5. Write entity unit tests.


### Phase 2: Define Use Case Ports (Non-Breaking Interface Extraction)

**Goal**: Define the boundaries between business logic and infrastructure.

Steps:
1. For each "service" method that another module (or a second entry point) will call, define an Input Port interface. For use cases only called by one controller in the same module an Input Port is optional — skip it.
2. For each database access pattern used by a service, define a Repository interface.
3. Place all interfaces in the module's `application/ports/` (`input/` and `output/`).
4. Have existing services implement the Input Port interfaces.
5. Have existing repository/ORM classes implement the Repository interfaces.


### Phase 3: Extract Interactors (Decouple Business Logic from Infrastructure)

**Goal**: Move application business logic into framework-independent interactors.

Steps:
1. Create the module's `application/interactors/` folder.
2. Create an Interactor class that:
   - Implements the Input Port (if one was defined).
   - Accepts Repository interface via constructor injection.
   - Has no ORM imports, no HTTP imports.
3. Move the actual business logic from the service into the interactor.
4. Update the existing service to delegate to the interactor.


### Phase 4: Extract Gateways (Decouple Infrastructure from Business Logic)

**Goal**: Move all database/external code into adapter implementations.

Steps:
1. Create the module's `infrastructure/gateways/` folder.
2. Create Gateway/Repository implementation classes that implement the interfaces from Phase 2.
3. These classes contain all ORM/SQL code.
4. Create a data mapper to translate between domain entities and ORM models.
5. Add an in-memory implementation for testing.


### Phase 5: Extract Controllers and Presenters (Adapter Layer Cleanup)

**Goal**: Thin out controllers and introduce the Humble Object pattern.

Steps:
1. Create the module's `infrastructure/controllers/` (and `presenters/`) folders.
2. Extract HTTP request parsing from fat controllers into thin adapter controllers.
3. Create Presenter classes that implement Output Ports.
4. Make HTTP route handlers (Humble Objects) delegate to controllers and read from presenters.

### Phase 6: Create the Composition Root (Main)

**Goal**: Centralize all wiring in Main.

Steps:
1. Create the composition root (`src/main/`, `src/<package>/main/`, or `internal/bootstrap/` + `cmd/<app>/` in Go).
2. Move every construction of a concrete class across layers there.
3. Wire: Gateway → Presenter → Interactor → Controller → Router, one function per module; connect modules there through input ports only.
4. Test that the application still starts and works end-to-end.

### Phase 7: Enforce the Dependency Rule

**Goal**: Add tooling to prevent regressions.

Add lint rules or architecture tests for BOTH axes — layers and modules:

Use the enforcement the `init` skill sets up for the language (its references), and run `ca-scan` in CI (the job is in the `init` references): it checks both axes, SQL table ownership, configuration placement and cycles in every supported language. During migration, keep a linter's rule at warning level so existing violations are visible without blocking the build, and raise it to error once a module is migrated.

## Migration Execution Plan

For the specific path provided, generate a step-by-step migration plan:

```
MIGRATION PLAN FOR: <path>
===========================

Current Architecture Pattern: [identified pattern]
Estimated Effort: [S/M/L/XL]

PHASE 0 — Module Identification (0 risk — planning only)
  [ ] List modules and map each existing file to one
  [ ] Decide shared/ contents and the cross-module ports

(Phases 1–5 repeat for each module, least-depended-on first)

PHASE 1 — Entity Extraction (0 risk — pure extraction)
  [ ] Create modules/<module>/domain/<name>
  [ ] Move business methods from <source file>
  [ ] Add entity unit tests
  [ ] Have source file delegate to entity
  [ ] Verify all existing tests still pass

PHASE 2 — Port Definition (0 risk — adding interfaces)
  [ ] Create modules/<module>/application/ports/input/<name> (only where another module / entry point needs it)
  [ ] Create modules/<module>/application/ports/output/<name>-repository
  [ ] Create cross-module ports (e.g. <other>-lookup) where a capability calls another module
  [ ] Have existing classes implement the interfaces

PHASE 3 — Interactor Extraction (low risk — new class, old delegates)
  [ ] Create modules/<module>/application/interactors/<name>
  [ ] Write interactor unit tests (with mocks)
  [ ] Have old service delegate to interactor

PHASE 4 — Gateway Extraction (medium risk — DB layer refactor)
  [ ] Create modules/<module>/infrastructure/gateways/<name>-repository-impl
  [ ] Create in-memory implementation for tests
  [ ] Write integration tests
  [ ] Update Main wiring

PHASE 5 — Controller/Presenter Split (medium risk — HTTP layer refactor)
  [ ] Extract controllers and presenters
  [ ] Verify HTTP responses unchanged

PHASE 6 — Main/Composition Root (low risk — wiring consolidation)
  [ ] Consolidate all wiring in main/ (one compose<Module> per module)
  [ ] Connect modules only through input ports
  [ ] Remove direct instantiation from other layers

PHASE 7 — Enforce the Rule (0 risk — tooling only)
  [ ] Add eslint-plugin-boundaries / import-linter / ArchUnit tests (layers AND modules)
  [ ] Run lint in CI
```

## Output
1. Identified anti-patterns in the provided code.
2. A phased migration plan with specific file changes.
3. Files created/modified in the current phase.
4. Tests to write before and after migration.
5. A before/after comparison of the architecture.
