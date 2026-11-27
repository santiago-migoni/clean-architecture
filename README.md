# Clean Architecture Plugin for Claude Code

A native Claude Code plugin that enforces and guides implementation of **Clean Architecture** as defined by Robert C. Martin ("Uncle Bob") in *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

## Installation

### Option 1 — Install directly (recommended)

In any Claude Code session:

```
/plugin install santiago-migoni/clean-architecture
```

> **Note:** `/plugin marketplace add` and `/plugin install` are different commands.
> - `/plugin marketplace add santiago-migoni/clean-architecture` — registers this repo as a **marketplace** (a registry), then you still need to install the plugin from it.
> - `/plugin install santiago-migoni/clean-architecture` — installs the **plugin directly**. This is what you want.

### Option 2 — Via marketplace (two steps)

```
/plugin marketplace add santiago-migoni/clean-architecture
/plugin install clean-architecture@clean-architecture-marketplace
```

### Option 3 — Install from a local clone

```bash
git clone https://github.com/santiago-migoni/clean-architecture.git
```

Then in Claude Code:

```
/plugin install /path/to/clean-architecture
```

### Option 4 — Point Claude Code directly at the directory

```bash
claude --plugin-dir /path/to/clean-architecture
```

## Requirements

- Claude Code (latest version)
- Node.js 18+ (for the MCP server — the dependency scanner, metrics calculator, and scaffolder)

No `npm install` needed — the MCP server uses only Node.js built-ins.

## Available Commands

All commands are namespaced under `/clean-architecture:`. Every skill has a `description` in its frontmatter, so Claude also loads the right one by itself when the request matches (e.g. "add a use case to orders" loads `usecase`).

| Command | What it does |
|---|---|
| `/clean-architecture:rules` | The rules every other skill assumes: layout, Dependency Rule, Module Rule, layer responsibilities, SOLID, Test Boundary. Loaded before writing or reviewing code in a project that uses the layout |
| `/clean-architecture:init` | Scaffold a full feature-first Clean Architecture project (modules with domain / application / infrastructure) |
| `/clean-architecture:entity` | Create an Enterprise Business Rule entity in a module's `domain/` |
| `/clean-architecture:usecase` | Create a Use Case interactor with Input/Output Ports in a module's `application/` |
| `/clean-architecture:controller` | Create an Interface Adapter controller in a module's `infrastructure/` |
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
| `ca_scaffold` | Creates the lean scaffold: `domain/application/infrastructure` per module (with `.gitkeep` stubs), `src/main/index` and `docs/architecture/ARCHITECTURE.md`. `shared/`, `platform/`, `ports/`, `controllers/`, `gateways/` and `tests/` are created on demand by the skills, never empty. Never overwrites existing files |
| `ca_layer_of` | Identifies which layer and module a file belongs to and checks its imports for compliance |
| `ca_cycles` | Detects cyclic dependencies between components — modules, `shared`, `platform`, `main` (ADP check) |

## Languages

The rules are the same in every language; what changes is how imports are written. The engine reads them through a **language profile** (`src/lib/languages/`):

| Language | Files | Imports understood | An import is project code when… |
|---|---|---|---|
| TypeScript / JavaScript | `.ts .tsx .mts .cts .js .jsx .mjs .cjs` | `import`/`export … from`, `import type`, side-effect `import`, `import()`, `require()` | it is relative, uses an alias (`@/`, `~/`, `src/`), or is a `baseUrl` path whose first folder exists under `src/` |
| Python | `.py` | `import a, b as c`, `from … import`, relative imports, also indented (inside `try:` or a function) | it is relative, or its top-level package exists under `src/` (or the root) |
| Go | `.go` | single and grouped `import`, with or without an alias (`x`, `_`, `.`) | it starts with the module path in the nearest `go.mod` |

Source files in any other language (Java, Kotlin, C#, …) are **reported as not checked** and the project gets no health score, instead of a misleading 100.

Each profile has a fixture in [`fixtures/<language>/`](fixtures): a small project that builds and runs with its own toolchain, and that `verify:example` scans clean and then with planted violations. Adding a language means adding a profile, its fixture and its checks — the rules themselves do not change.

## Hooks

**SessionStart.** A plugin's `CLAUDE.md` is never loaded into the projects that install it, so the rules ship as the `rules` skill. When a session starts in a project that has a `modules/` folder (under `src/`, `app/` or the root), this hook tells Claude to load `clean-architecture:rules` before writing or reviewing code. Any other project gets no Clean Architecture context at all.

**PostToolUse (real time).** The plugin registers a **PostToolUse hook** that fires after every file edit. If the file you just wrote violates the Dependency Rule or the Module Rule, you'll see a warning inline in Claude Code immediately:

```
⚠️  CLEAN ARCHITECTURE — ARCHITECTURE RULE VIOLATION
   File:  src/modules/orders/application/interactors/place-order.ts
   Layer: APPLICATION (module: orders) (may only depend on: domain, shared)

   ✗ imports "../../infrastructure/gateways/sql-order-repository" — application must not depend on infrastructure
     Fix: Define an interface (port) in this module's application/ports/ and inject the concrete implementation from main/.
   ✗ imports "../../../customers/domain/customer" — module "orders" must not import module "customers" directly
     Fix: Declare a port owned by "orders" (application/ports/output), implement it in "orders/infrastructure/gateways" by calling "customers/application/ports/input", and reference "customers" entities from the domain by id only.
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

## Example Project

[`examples/shop`](examples/shop) is a runnable reference built by applying the skills: two modules (`orders`, `customers`), Express, SQLite, 57 tests and the architecture rules enforced by ESLint. It shows the optional pieces in use (an Input Port only where another module calls the use case, a Presenter only where output is formatted), the cross-module recipe, and the guards that a happy-path test misses.

```bash
cd examples/shop && npm ci && npm test && npm start
```

## Continuous Integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs two jobs on every pull request and on `main`:

| Job | What it guards |
|---|---|
| **Plugin engine** | Syntax of the MCP server, hook and rules; the JSON manifests; and `npm run verify:example`, which checks the scanner **in both directions**: `examples/shop` and every language fixture must be clean, and planted violations (outward import, cross-module import, `infrastructure` → `platform`, a file directly under `infrastructure/`, a folder named `modules/` that is not business code, a legacy layout) must be found — in each language's own import syntax, while external packages named like a layer are ignored. A scanner that reports nothing may simply be broken, so a clean result alone proves nothing. |
| **Example** (Node 22.13.0, 22, 24) | `npm ci` from the lockfile, `tsc`, ESLint with the architecture rules, and the 57 tests. The TypeScript fixture is typechecked with the same toolchain. |
| **Fixtures** | Each language fixture builds and runs with its own toolchain: `go vet` and `go test` for Go, `python -m shop.main` for Python. A fixture that is not real code would test the scanner against imports nobody writes. |

Run the engine check locally with `npm run verify:example`.

## Clean Architecture Concepts Covered

**Layers (inside every module):** `domain` (Entities) → `application` (Use Cases) → `infrastructure` (Interface Adapters) → `platform` (Frameworks & Drivers), plus `shared` (shared kernel) and `main` (composition root)

**Modules:** each folder under `src/modules/` is a cohesive component; modules talk only through ports (`A/infrastructure` → `B/application/ports/input`)

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

`init` creates only what every project needs:

```
<project-root>/
├── src/
│   ├── modules/
│   │   └── <module>/             # one folder per business capability
│   │       ├── domain/           # Enterprise Business Rules (imports only shared/)
│   │       ├── application/      # Application Business Rules
│   │       └── infrastructure/   # Interface Adapters (the detail)
│   └── main/                     # Composition Root — wires every module
└── docs/architecture/            # ARCHITECTURE.md, diagrams, ADRs
```

Everything else is **created on demand** by the first file that needs it, never as empty folders:

```
src/modules/<m>/
├── domain/{events,errors,services}/          # when the first event / domain error / domain service exists
├── application/
│   ├── interactors/                          # use cases
│   └── ports/
│       ├── input/                            # optional — when another module or a 2nd entry point calls the use case
│       └── output/                           # repository interfaces and other outbound ports
└── infrastructure/
    ├── controllers/
    ├── presenters/                           # optional — only for use cases with an Output Port
    └── gateways/{in-memory,migrations}/
src/shared/                                   # shared kernel — only when two modules truly share a type
src/platform/{web,db,external}/               # frameworks & drivers
src/main/<app>/                               # instead of main/index when there are several entry points
tests/
├── <module>/unit/                            # mirrors src/modules/<module>/
├── <module>/integration/                     # flat: gateway tests against a real DB
└── e2e/
```

### Macro decisions

- **Tests by module** (`tests/<module>/...`): removing or extracting a module means deleting `src/modules/<m>` and `tests/<m>`.
- **Docs only in `docs/architecture/`**, never inside `src/`.
- **Names follow the language**: kebab-case in TypeScript, snake_case in Python and Go. Go has no `src/` (`internal/modules/<m>/`, wiring in `internal/bootstrap/`, entry points in `cmd/<app>/`) and keeps its tests beside the code (`_test.go`, `//go:build integration` for gateways against a real DB). See "Language conventions" in the `rules` skill.
- **One entry point** → `src/main/index`; several (api, worker, cli) → `src/main/<app>/index`. A monorepo (`apps/`, `packages/`) only for separately deployed artifacts.
- **Migrations live with their module** (`infrastructure/gateways/migrations/`); the connection and runner live in `platform/db/`.
- **Optional pieces:** an Input Port exists when another module or a second entry point calls the use case; an Output Port + Presenter exists when output formatting is non-trivial. Otherwise the interactor returns a response model and the controller maps it to HTTP.

### The two rules

| Axis | Rule |
|---|---|
| **Layers** | Dependencies point inward: `infrastructure → application → domain`. `infrastructure` never imports `platform/` (the framework client is injected from `main/`). |
| **Modules** | A module never imports another module's `domain/` or `infrastructure/`. The only legal crossing is `A/infrastructure → B/application/ports/input`, through a port owned by A. |

Reserved names that cannot be module names: `shared`, `platform`, `main`, `domain`, `application`, `infrastructure`, `modules`, `bootstrap` and `composition` (aliases of `main`), plus `app`, `infra` and `adapters` (layer folders of versions before 2.0).

### Migrating from the previous layout

Earlier versions generated `src/{entities,usecases,adapters,frameworks,main}/`. Run `/clean-architecture:migrate src/` to move to modules. Mapping: `entities → modules/<m>/domain`, `usecases → modules/<m>/application`, `adapters → modules/<m>/infrastructure`, `frameworks → platform`. File names are now kebab-case (`create-order`, `sql-order-repository`) instead of `ICreateOrderUseCase` / `OrderRepositoryImpl`; the class and interface names inside are unchanged.

### Migrating from 1.x folder names

Versions before 2.0 used `modules/<m>/app/` and `modules/<m>/infra/adapters/{controllers,presenters,gateways}/`. The rules still apply to those folders, and `ca_scan` warns about them. To rename: `app/` → `application/`, `infra/adapters/<x>/` → `infrastructure/<x>/` (one level less), the same in `tests/<m>/`, then fix the imports and the lint config (`/clean-architecture:migrate` does it).

## License

MIT

## Credits

Maintained by [Santiago Migoni](https://github.com/santiago-migoni). Originally created by [Marcos Tawadros (MorcosS)](https://github.com/morcoss). Released under the [MIT license](LICENSE).
