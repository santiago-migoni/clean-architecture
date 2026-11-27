---
name: check
description: "This skill should be used when the user asks to \"check the Dependency Rule\", \"scan for architecture violations\", \"find imports that point outward\", \"find cross-module imports\", \"verify the module boundaries\", or wants a full violation report with severities and fixes before a commit or review."
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to run a **full Dependency Rule and Module Rule scan** across the entire codebase.

When the `ca_scan` MCP tool is available, run it first: it applies exactly the rules below and returns severity, file, import and fix for every violation. Use the manual steps to confirm findings and to cover languages or aliases the tool cannot resolve.

## The Dependency Rule (axis 1 — layers)

From the book (Chapter 22 — The Clean Architecture):
> "This rule says that source code dependencies can only point inward. Nothing in an inner circle can know anything at all about something in an outer circle. In particular, the name of something declared in an outer circle must not be mentioned by the code in an inner circle."

The allowed dependency directions are:

```
INNER (most stable, highest level)
  ┌──────────────────────────────────────────────┐
  │  domain         (modules/<m>/domain/)        │
  │                                              │
  │   ┌────────────────────────────────────┐     │
  │   │  app        (modules/<m>/app/)     │     │
  │   │                                    │     │
  │   │   ┌────────────────────────────┐   │     │
  │   │   │  infra   (modules/<m>/     │   │     │
  │   │   │          infra/)           │   │     │
  │   │   │                            │   │     │
  │   │   │   ┌────────────────────┐   │   │     │
  │   │   │   │  platform          │   │   │     │
  │   │   │   │  (src/platform/)   │   │   │     │
  │   │   │   └────────────────────┘   │   │     │
  │   │   └────────────────────────────┘   │     │
  │   └────────────────────────────────────┘     │
  └──────────────────────────────────────────────┘
OUTER (most volatile, lowest level)

shared (src/shared/) is the shared kernel: importable by every layer, imports nothing.
main   (src/main/)   is outside the circles: it may import everything, nobody imports it.
```

**Allowed imports (layers):**
- `shared/` → (nothing — pure)
- `domain/` → `shared/`
- `app/` → `domain/`, `shared/`
- `infra/adapters/` → `app/`, `domain/`, `shared/`
- `platform/` → `infra/adapters/`, `app/`, `domain/`, `shared/`
- `main/` → all (wiring only)

**Forbidden imports (violations):**
- `domain/` importing from `app/`, `infra/`, `platform/`, `main/`
- `app/` importing from `infra/`, `platform/`, `main/`
- `infra/adapters/` importing from `platform/`, `main/` (the framework client is injected from `main/`)
- Any inner layer importing a CONCRETE class from an outer layer

## The Module Rule (axis 2 — modules)

Each folder under `src/modules/` is a component. The only legal way for module A to reach module B is:

```
A/infra/adapters/...  →  B/app/ports/input/...
```
through a port owned by A (declared in `A/app/ports/output/`, implemented in `A/infra/adapters/gateways/`).

**Forbidden (violations):**
- Module A importing `B/domain/`, `B/app/` (other than `ports/input/`), or `B/infra/`.
- `A/domain`, `A/app` importing anything from module B.
- Cycles between modules (A → B → A).
- Business policy hidden in `shared/` that belongs to one module.

## Your Task

### Step 1: Read the Project Structure

Resolve every path **relative to `src/`** (never match on the absolute path — a project living under `/app/` must not be misclassified), then identify the layer and module **by position**: the top-level folder under `src/` (or, inside `modules/<name>/`, the folder right after the module name) decides the layer. A folder with a layer-like name deeper in the path does not: `src/main/app/` is Main, and `src/modules/orders/domain/shared/` is still `orders`' domain.

- `modules/<name>/domain/` → layer `domain`, module `<name>`
- `modules/<name>/app/` → layer `app`, module `<name>`
- `modules/<name>/infra/` → layer `infra`, module `<name>` — the **whole** `infra/` folder, not only `infra/adapters/`: a file placed directly under `infra/` must not escape the rules
- `shared/` → shared kernel
- `platform/` → layer `platform`
- `main/` (or `bootstrap/`, `composition/`) → Main (Composition Root)
- Any other top-level folder under `src/` that is not one of the above is a **structure finding**: it is either a legacy layer (`entities/`, `usecases/`, `adapters/`, `frameworks/`) awaiting `/clean-architecture:migrate`, or code that does not belong to any module.

### Step 2: Extract All Import Statements

For each file, extract all import/require statements and determine:
- Which layer and module is the importing file in?
- Which layer and module is the imported file in? (resolve relative imports against the importing file; treat `@/…` aliases as `src/…`)
- Is the import direction inward (allowed) or outward (violation)?
- Does it cross a module boundary, and if so is it `infra/adapters → app/ports/input`?

#### TypeScript/JavaScript patterns to scan:
```
import { ... } from '...'
import * as ... from '...'
const ... = require('...')
export { ... } from '...'
```

#### Python patterns to scan:
```
from ... import ...
import ...
```
(resolve relative dots against the file's package)

#### Java patterns to scan:
```
import com.example.modules.<module>.<layer>...;
```

#### Go patterns to scan:
```
import "<module>/<package>"
```

### Step 3: Classify Each Import

For each import, classify as:
- **ALLOWED**: Importing inward or same-layer in the same module; or the one legal cross-module edge.
- **VIOLATION**: Importing outward, or crossing a module boundary illegally.
- **WARNING**: Importing a concrete class from an outer layer (even if inward).
- **DANGER**: Importing a framework class inside `domain/` or `app/`.

### Step 4: Check for Additional Anti-Patterns

Beyond import direction, check for:

1. **Concrete class instantiation in inner layers** (`new SqlOrderRepository()` in an interactor).
2. **Framework-specific types in inner layers** (Express `Request`, Spring `@Autowired` on entities, SQLAlchemy `Column` in `domain/`).
3. **ORMs in the domain** (Hibernate `@Entity`, TypeORM `@Entity()` on domain entities).
4. **HTTP status codes in use cases** (`res.status(404)` inside an interactor).
5. **Environment variables accessed in inner layers** (`process.env.DB_URL` in `domain/` or `app/`).
6. **Logging framework calls in the domain** (`console.log`, `logger.info` with external loggers).
7. **Date.now() or random number generation in business rules** (should be injected as a port).
8. **Port interfaces defined in the wrong layer** (repository interface in `infra/` instead of `app/ports/output/`), or in the wrong module.
9. **Entities of another module held by reference** (an `Order` holding a `Customer` instead of `customerId`).
10. **Instantiation outside `main/`** — `platform/` or adapters calling `new` on interactors or gateways.
11. **Module cycles** — use `ca_cycles` when available.

### Step 5: Report All Violations

For each violation:
```
ARCHITECTURE RULE VIOLATION
  Rule: dependency-rule | cross-module
  Severity: CRITICAL | HIGH | MEDIUM
  File: <path>:<line>
  Module: <module>
  Import: '<import path>'
  Issue: <importing layer> depends on <imported layer>  |  module "<a>" imports module "<b>" directly
  Detail: <specific description>
  Fix: <concrete action>

  Before (layer):
    import { SqlOrderRepository } from '../../infra/adapters/gateways/sql-order-repository';

  After:
    // Depend on the port declared in app/, inject the implementation from main/
    // import { IOrderRepository } from '../ports/output/order-repository';

  Before (module):
    import { Customer } from '../../../customers/domain/customer';

  After:
    // orders/app/ports/output/customer-lookup.ts  declares ICustomerLookup
    // orders/infra/adapters/gateways/customer-lookup-gateway.ts  calls customers/app/ports/input/get-customer
    // orders/domain keeps only `customerId: string`
```

### Step 6: Severity Classification

- **CRITICAL**: `domain/` or `shared/` imports from any other layer. Framework code in the domain.
- **HIGH**: `app/` imports from `infra/` or `platform/`. Concrete class instantiated in a use case. A module imports another module's `domain/`, `app/` (other than input ports) or `infra/`.
- **MEDIUM**: `infra/adapters` imports from `platform/` (inject the client instead).
- **LOW**: Port interface defined in the wrong layer or module. Missing interface for a cross-layer dependency.

### Step 7: Generate Summary Report

```
ARCHITECTURE SCAN REPORT
========================
Project: <root>
Files scanned: <N>
Modules: <list>
Date: <date>

RESULTS:
  ✓ Allowed imports: <N>
  ✗ Violations: <N>   (layers: <N>, cross-module: <N>)
  ⚠ Warnings: <N>

VIOLATIONS BY SEVERITY:
  CRITICAL: <N>  [domain/shared importing outer layers]
  HIGH:     <N>  [app importing outer layers; illegal cross-module imports]
  MEDIUM:   <N>  [adapters importing platform directly]
  LOW:      <N>  [wrong placement of interfaces]

VIOLATIONS BY MODULE / LAYER:
  <module>/domain:  <N> violations
  <module>/app:     <N> violations
  <module>/infra:   <N> violations
  platform:         <N> violations

MODULE GRAPH:
  <module> → <module> (via <port>)   [legal]
  <module> → <module> (direct)       [VIOLATION]
  Cycles: <none | list>

TOP VIOLATIONS (must fix immediately):
  1. <file>:<line> — <description>
  2. ...

ARCHITECTURAL HEALTH SCORE: <0-100>
  (100 = fully compliant, 0 = completely violated)

TREND:
  [If git history is available, compare to previous commit]
```

### Step 8: Auto-Fix Where Safe

For clear-cut violations where an interface already exists:
- Remove the direct import of a concrete class.
- Replace with the existing interface import.
- Note the change in the report.

For violations requiring new interfaces:
- Create the interface in the correct layer of the correct module.
- Update the import in the inner layer.
- Note that the concrete implementation still needs to be wired in `main/`.

For illegal cross-module imports, do NOT auto-fix: they need a design decision (which module owns the port, what vocabulary it uses). Report them with the recipe above.

## Zero-Violation Target

The goal is a 100% clean dependency graph. Every violation left unfixed is technical debt that will:
- Prevent independent testability of inner layers.
- Prevent independent deployment (or extraction) of modules.
- Make refactoring fragile and expensive.
- Spread framework coupling through business logic.

## Output
1. Full violation list with file:line and severity.
2. Auto-fixes applied.
3. Manual fixes required with step-by-step instructions.
4. Architectural health score.
5. Recommended lint/tooling setup to prevent regressions (both axes).
