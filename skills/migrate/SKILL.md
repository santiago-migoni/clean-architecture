You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to **migrate existing code** toward Clean Architecture.

The argument after the command is the path to the code to migrate (e.g., `src/`, `src/orders/`, a specific file).

## Migration Philosophy

From the book (Chapter 34 — The Missing Chapter):
> "The devil is in the implementation details."

The target layout is feature-first: `src/modules/<module>/{domain, app, infra/adapters}` plus `src/shared/`, `src/platform/` and `src/main/`.

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
Mapping (per module): `entities/<x>` → `modules/<m>/domain/`, `usecases/ports|interactors` → `modules/<m>/app/`, `adapters/*` → `modules/<m>/infra/adapters/`, `frameworks/*` → `platform/`. File names become kebab-case. Start with Phase 0 (identify the modules), then move the files of one module at a time and fix imports; `ca_scan` reports files still in the old folders.

## Migration Roadmap

### Phase 0: Identify the Modules (Planning Only — No Code Moves)

**Goal**: Decide the module boundaries before moving any code.

Steps:
1. List the business capabilities in the code (`orders`, `customers`, `billing`…). Group by *reason to change* (CCP), not by technical type: a module is what changes together.
2. Name each module in kebab-case. Avoid the reserved names `shared`, `platform`, `main`, `app`, `domain`, `infra`, `modules`, `adapters`.
3. Map every existing class/file to a module. Anything used by several modules and free of business policy (Money, Id, base errors) is a candidate for `src/shared/`.
4. Find the places where one capability calls another. Each becomes a **cross-module port** (owned by the caller, implemented in the caller's `infra`, calling the other module's input port) — decide them now.
5. Order the migration: start with the module that is depended on the least.

Phases 1–5 below are applied **per module**.

### Phase 1: Extract Entities (Safest — No Behavior Change)

**Goal**: Pull pure business logic out of service classes, controllers, or models.

Steps:
1. Identify classes/functions that contain enterprise business rules.
2. Create `src/modules/<module>/domain/` directory.
3. Create entity classes that:
   - Are framework-independent.
   - Contain only business methods and validation.
   - Have NO database operations, NO HTTP concerns.
4. Have the existing service/model DELEGATE to the entity.
5. Write entity unit tests.

```typescript
// BEFORE (business rule inside the service/ORM model):
class OrderService {
  canCancel(order: OrderDto): boolean {
    return order.status === 'PENDING' && order.items.length > 0;
  }
}

// AFTER — Phase 1: Extract to Entity
// src/modules/orders/domain/order.ts
export class Order {
  canBeCancelled(): boolean {
    return this.status === 'PENDING' && this.items.length > 0;
  }
}

// src/services/OrderService.ts (unchanged interface, delegates to entity)
class OrderService {
  canCancel(orderData: OrderDto): boolean {
    const order = Order.reconstitute(orderData);
    return order.canBeCancelled(); // delegates to entity
  }
}
```

### Phase 2: Define Use Case Ports (Non-Breaking Interface Extraction)

**Goal**: Define the boundaries between business logic and infrastructure.

Steps:
1. For each "service" method that another module (or a second entry point) will call, define an Input Port interface. For use cases only called by one controller in the same module an Input Port is optional — skip it.
2. For each database access pattern used by a service, define a Repository interface.
3. Place all interfaces in `src/modules/<module>/app/ports/` (`input/` and `output/`).
4. Have existing services implement the Input Port interfaces.
5. Have existing repository/ORM classes implement the Repository interfaces.

```typescript
// Step 2a: Define the input port
// src/modules/orders/app/ports/input/place-order.ts
export interface IPlaceOrderUseCase {
  execute(request: PlaceOrderRequestModel): Promise<void>;
}

// Step 2b: Define the repository interface
// src/modules/orders/app/ports/output/order-repository.ts
export interface IOrderRepository {
  findById(id: string): Promise<Order | null>;
  save(order: Order): Promise<void>;
}

// Step 2c: Existing service now declares it implements the port
// (behavior unchanged — just adding the interface declaration)
export class OrderService implements IPlaceOrderUseCase { /* ... */ }
```

### Phase 3: Extract Interactors (Decouple Business Logic from Infrastructure)

**Goal**: Move application business logic into framework-independent interactors.

Steps:
1. Create `src/modules/<module>/app/interactors/` directory.
2. Create an Interactor class that:
   - Implements the Input Port (if one was defined).
   - Accepts Repository interface via constructor injection.
   - Has no ORM imports, no HTTP imports.
3. Move the actual business logic from the service into the interactor.
4. Update the existing service to delegate to the interactor.

```typescript
// src/modules/orders/app/interactors/place-order.ts
// Pure business logic, no framework dependencies
export class PlaceOrderInteractor implements IPlaceOrderUseCase {
  constructor(
    private readonly outputPort: IPlaceOrderOutputPort,
    private readonly repository: IOrderRepository,
    private readonly customerLookup: ICustomerLookup, // port owned by `orders`, implemented against `customers`' input port
  ) {}

  async execute(request: PlaceOrderRequestModel): Promise<void> {
    // Business logic extracted from service/controller
    const customerExists = await this.customerLookup.exists(request.customerId);
    const order = Order.create({ ... });
    await this.repository.save(order);
    this.outputPort.present({ orderId: order.id });
  }
}
```

### Phase 4: Extract Gateways (Decouple Infrastructure from Business Logic)

**Goal**: Move all database/external code into adapter implementations.

Steps:
1. Create `src/modules/<module>/infra/adapters/gateways/` directory.
2. Create Gateway/Repository implementation classes that implement the interfaces from Phase 2.
3. These classes contain all ORM/SQL code.
4. Create a data mapper to translate between domain entities and ORM models.
5. Add an in-memory implementation for testing.

```typescript
// src/modules/orders/infra/adapters/gateways/order-repository-impl.ts
export class OrderRepositoryImpl implements IOrderRepository {
  constructor(private readonly ormRepo: TypeOrmOrderRepository) {}

  async findById(id: string): Promise<Order | null> {
    const row = await this.ormRepo.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async save(order: Order): Promise<void> {
    await this.ormRepo.save(toPersistence(order));
  }
}
```

### Phase 5: Extract Controllers and Presenters (Adapter Layer Cleanup)

**Goal**: Thin out controllers and introduce the Humble Object pattern.

Steps:
1. Create `src/modules/<module>/infra/adapters/controllers/` (and `presenters/`) directories.
2. Extract HTTP request parsing from fat controllers into thin adapter controllers.
3. Create Presenter classes that implement Output Ports.
4. Make HTTP route handlers (Humble Objects) delegate to controllers and read from presenters.

### Phase 6: Create the Composition Root (Main)

**Goal**: Centralize all wiring in Main.

Steps:
1. Create `src/main/` directory.
2. Move all `new ConcreteClass()` calls to main.
3. Wire: Gateway → Presenter → Interactor → Controller → Router, one `compose<Module>` function per module in `src/main/modules/`; connect modules there through input ports only.
4. Test that the application still starts and works end-to-end.

### Phase 7: Enforce the Dependency Rule

**Goal**: Add tooling to prevent regressions.

Add lint rules or architecture tests for BOTH axes — layers and modules:

#### TypeScript — eslint-plugin-boundaries (v7):
Use the `eslint.config.js` from `/clean-architecture:init` (section "Rule enforcement"). It defines the element types `shared`, `domain`, `input-port`, `app`, `infra`, `platform`, `main` and one policy per allowed edge, with the `{{ from.element.captured.module }}` template so a module may only depend on itself, plus the single legal cross-module edge `infra → input-port`. It uses `boundaries/dependencies` with `policies`; older plugin versions (`boundaries/element-types`) have a different syntax.

During migration, set the rule to `1` (warn) so the existing violations are visible without blocking the build, then raise it to `2` (error) once the module is migrated.

#### Java — ArchUnit test:
```java
@Test
void domainShouldNotDependOnApp() {
    noClasses().that().resideInAPackage("..modules..domain..")
        .should().dependOnClassesThat().resideInAPackage("..modules..app..")
        .check(importedClasses);
}

@Test
void modulesShouldNotDependOnEachOther() {
    slices().matching("..modules.(*)..").should().notDependOnEachOther()
        .ignoreDependency(resideInAPackage("..infra.adapters.."), resideInAPackage("..app.ports.input.."))
        .check(importedClasses);
}
```

#### Python — import-linter:
```ini
[importlinter:contract:layers]
name = Layers inside each module
type = layers
layers =
    myapp.modules.orders.infra
    myapp.modules.orders.app
    myapp.modules.orders.domain

[importlinter:contract:modules]
name = Modules do not import each other
type = independence
modules =
    myapp.modules.orders
    myapp.modules.customers
ignore_imports =
    myapp.modules.orders.infra.adapters.** -> myapp.modules.customers.app.ports.input.**
```

## Migration Execution Plan

For the specific path provided, generate a step-by-step migration plan:

```
MIGRATION PLAN FOR: <path>
===========================

Current Architecture Pattern: [identified pattern]
Estimated Effort: [S/M/L/XL]

PHASE 0 — Module Identification (0 risk — planning only)
  [ ] List modules and map each existing file to one
  [ ] Decide src/shared/ contents and the cross-module ports

(Phases 1–5 repeat for each module, least-depended-on first)

PHASE 1 — Entity Extraction (0 risk — pure extraction)
  [ ] Create src/modules/<module>/domain/<name>.ts
  [ ] Move business methods from <source file>
  [ ] Add entity unit tests
  [ ] Have source file delegate to entity
  [ ] Verify all existing tests still pass

PHASE 2 — Port Definition (0 risk — adding interfaces)
  [ ] Create src/modules/<module>/app/ports/input/<name>.ts (only where another module / entry point needs it)
  [ ] Create src/modules/<module>/app/ports/output/<name>-repository.ts
  [ ] Create cross-module ports (e.g. <other>-lookup.ts) where a capability calls another module
  [ ] Have existing classes implement the interfaces

PHASE 3 — Interactor Extraction (low risk — new class, old delegates)
  [ ] Create src/modules/<module>/app/interactors/<name>.ts
  [ ] Write interactor unit tests (with mocks)
  [ ] Have old service delegate to interactor

PHASE 4 — Gateway Extraction (medium risk — DB layer refactor)
  [ ] Create src/modules/<module>/infra/adapters/gateways/<name>-repository-impl.ts
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
