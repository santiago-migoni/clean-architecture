# Clean Architecture Plugin for Claude Code

A native Claude Code plugin that enforces and guides implementation of **Clean Architecture** as defined by Robert C. Martin ("Uncle Bob") in *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

## Installation

### Option 1 — Install directly (recommended)

In any Claude Code session:

```
/plugin install morcoss/clean-architecture-plugin
```

> **Note:** `/plugin marketplace add` and `/plugin install` are different commands.
> - `/plugin marketplace add morcoss/clean-architecture-plugin` — registers this repo as a **marketplace** (a registry), then you still need to install the plugin from it.
> - `/plugin install morcoss/clean-architecture-plugin` — installs the **plugin directly**. This is what you want.

### Option 2 — Via marketplace (two steps)

```
/plugin marketplace add morcoss/clean-architecture-plugin
/plugin install clean-architecture@morcoss-clean-architecture-plugin
```

### Option 3 — Install from a local clone

```bash
git clone https://github.com/morcoss/clean-architecture-plugin.git
```

Then in Claude Code:

```
/plugin install /path/to/clean-architecture-plugin
```

### Option 4 — Point Claude Code directly at the directory

```bash
claude --plugin-dir /path/to/clean-architecture-plugin
```

## Requirements

- Claude Code (latest version)
- Node.js 18+ (for the MCP server — the dependency scanner, metrics calculator, and scaffolder)

No `npm install` needed — the MCP server uses only Node.js built-ins.

## Available Commands

All commands are namespaced under `/clean-architecture:`.

| Command | What it does |
|---|---|
| `/clean-architecture:init` | Scaffold a full feature-first Clean Architecture project (modules with domain / app / infra) |
| `/clean-architecture:entity` | Create an Enterprise Business Rule entity in a module's `domain/` |
| `/clean-architecture:usecase` | Create a Use Case interactor with Input/Output Ports in a module's `app/` |
| `/clean-architecture:controller` | Create an Interface Adapter controller in a module's `infra/` |
| `/clean-architecture:presenter` | Create a Presenter (Humble Object Pattern) |
| `/clean-architecture:gateway` | Create a Gateway/Repository with data mapper (and cross-module gateways) |
| `/clean-architecture:boundary` | Define and enforce architectural boundaries |
| `/clean-architecture:solid` | Audit and fix SOLID principle violations |
| `/clean-architecture:components` | Audit component cohesion (REP/CCP/CRP) and coupling (ADP/SDP/SAP) |
| `/clean-architecture:check` | Full Dependency Rule and Module Rule violation scan |
| `/clean-architecture:review` | 100-point Clean Architecture audit scorecard |
| `/clean-architecture:test` | Create Test Boundary compliant tests by layer |
| `/clean-architecture:main` | Create/update the Main composition root (one `compose<Module>` per module) |
| `/clean-architecture:diagram` | Generate architecture diagrams (ASCII + Mermaid) |
| `/clean-architecture:migrate` | Phased migration from any anti-pattern to Clean Architecture |

## MCP Tools (used automatically by Claude)

The plugin ships an MCP server (`src/server.js`) that gives Claude real file-system analysis capabilities:

| Tool | Description |
|---|---|
| `ca_scan` | Scans every source file for Dependency Rule and Module Rule violations — returns severity, rule, file, import, and fix |
| `ca_metrics` | Calculates Fan-in, Fan-out, Instability (I), Abstractness (A), and Distance from Main Sequence (D) per component (each module, `shared`, `platform`, `main`) |
| `ca_scaffold` | Creates the full directory and file scaffold: one `domain/app/infra` set per module, plus `shared/`, `platform/`, `main/` and the matching `tests/` tree |
| `ca_layer_of` | Identifies which layer and module a file belongs to and checks its imports for compliance |
| `ca_cycles` | Detects cyclic dependencies between components — modules, `shared`, `platform`, `main` (ADP check) |

## Real-time Hook

The plugin registers a **PostToolUse hook** that fires after every file edit. If the file you just wrote violates the Dependency Rule or the Module Rule, you'll see a warning inline in Claude Code immediately:

```
⚠️  CLEAN ARCHITECTURE — ARCHITECTURE RULE VIOLATION
   File:  src/modules/orders/app/interactors/place-order.ts
   Layer: APP (module: orders) (may only depend on: domain, shared)

   ✗ imports "../../infra/adapters/gateways/sql-order-repository" — app must not depend on adapters
     Fix: Define an interface (port) in this module's app/ports/ and inject the concrete implementation from main/.
   ✗ imports "../../../customers/domain/customer" — module "orders" must not import module "customers" directly
     Fix: Declare a port owned by "orders" (app/ports/output), implement it in "orders/infra/adapters" by calling "customers/app/ports/input", and reference "customers" entities from the domain by id only.
```

The hook and the MCP server share one rule set (`src/lib/architecture.js`), so they always agree.

## Usage Examples

```
/clean-architecture:init TypeScript REST API with orders and customers modules
/clean-architecture:entity orders/Order
/clean-architecture:usecase orders/PlaceOrder
/clean-architecture:gateway orders/CustomerLookup
/clean-architecture:check
/clean-architecture:review
/clean-architecture:solid src/
/clean-architecture:migrate src/services/
```

## Clean Architecture Concepts Covered

**Layers (inside every module):** `domain` (Entities) → `app` (Use Cases) → `infra/adapters` (Interface Adapters) → `platform` (Frameworks & Drivers), plus `shared` (shared kernel) and `main` (composition root)

**Modules:** each folder under `src/modules/` is a cohesive component; modules talk only through ports (`A/infra/adapters` → `B/app/ports/input`)

**Principles:**
- The Dependency Rule (Chapter 22)
- SOLID — SRP, OCP, LSP, ISP, DIP (Part III)
- Component Cohesion — REP, CCP, CRP (Chapter 13)
- Component Coupling — ADP, SDP, SAP (Chapter 14)
- Screaming Architecture (Chapter 21)
- Humble Object Pattern (Chapter 23)
- Partial Boundaries (Chapter 24)
- The Main Component (Chapter 26)
- Test Boundary (Chapter 28)
- The Database is a Detail (Chapter 30)
- The Web is a Detail (Chapter 32)
- Frameworks are Details (Chapter 33)

## Project Structure Generated by `/clean-architecture:init`

```
src/
├── modules/
│   ├── orders/                       # one folder per business capability
│   │   ├── domain/                   # Enterprise Business Rules (imports only shared/)
│   │   ├── app/
│   │   │   ├── ports/
│   │   │   │   ├── input/            # Input Port interfaces (other modules may call these)
│   │   │   │   └── output/           # Output Ports & Repository interfaces
│   │   │   └── interactors/          # Use Case implementations
│   │   └── infra/
│   │       └── adapters/
│   │           ├── controllers/      # Framework input → Use Case request model
│   │           ├── presenters/       # Use Case response model → View model
│   │           └── gateways/         # Repository implementations + data mappers
│   │               └── in-memory/    # In-memory repos for unit tests
│   └── customers/                    # same shape
├── shared/                           # Shared kernel — pure, minimal, imports nothing
├── platform/
│   ├── web/                          # HTTP framework wiring, route registration
│   ├── db/                           # Database drivers & ORM config
│   └── external/                     # Third-party API clients
└── main/                             # Composition Root — wires every module
tests/
├── unit/<module>/{domain,app,infra/adapters}/   # Pure tests, no I/O
├── integration/<module>/infra/adapters/gateways/ # Gateway tests with real DB
└── e2e/                              # Full stack tests
```

### The two rules

| Axis | Rule |
|---|---|
| **Layers** | Dependencies point inward: `infra → app → domain`. `infra/adapters` never imports `platform/` (the framework client is injected from `main/`). |
| **Modules** | A module never imports another module's `domain/` or `infra/`. The only legal crossing is `A/infra/adapters → B/app/ports/input`, through a port owned by A. |

Reserved names that cannot be module names: `shared`, `platform`, `main`, `app`, `domain`, `infra`, `modules`, `adapters`.

### Migrating from the previous layout

Earlier versions generated `src/{entities,usecases,adapters,frameworks,main}/`. Run `/clean-architecture:migrate src/` to move to modules. Mapping: `entities → modules/<m>/domain`, `usecases → modules/<m>/app`, `adapters → modules/<m>/infra/adapters`, `frameworks → platform`. File names are now kebab-case (`create-order`, `sql-order-repository`) instead of `ICreateOrderUseCase` / `OrderRepositoryImpl`; the class and interface names inside are unchanged.

## License

MIT
