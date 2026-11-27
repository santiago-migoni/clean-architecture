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
| `/clean-architecture:event` | Publish an integration event from one module and react to it in another (bus, subscribers, idempotency) |
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
| `ca_scaffold` | Creates the lean scaffold in the language's own layout — TypeScript/JavaScript: `src/modules/<m>/…` + `src/main/index`; Python: `src/<package>/modules/<m>/…` (snake_case, `__init__.py` packages) + `main/__main__.py`; Go: `internal/modules/<m>/…` + `internal/bootstrap/` + `cmd/<app>/main.go` — plus `docs/architecture/ARCHITECTURE.md`. `shared/`, `platform/`, `ports/`, `controllers/`, `gateways/` and `tests/` are created on demand by the skills, never empty. Every generated file is valid code in its language (checked by `verify:example`: Python runs, Go passes `go vet`). Rejects other languages and reserved or invalid module names; never overwrites existing files |
| `ca_layer_of` | Identifies which layer and module a file belongs to and checks its imports for compliance |
| `ca_cycles` | Detects cyclic dependencies between components — modules, `shared`, `platform`, `main` (ADP check) |

## Languages

The rules are the same in every language; what changes is how imports are written. The engine reads them through a **language profile** (`src/lib/languages/`):

| Language | Files | Imports understood | An import is project code when… |
|---|---|---|---|
| TypeScript / JavaScript | `.ts .tsx .mts .cts .js .jsx .mjs .cjs` | `import`/`export … from`, `import type`, side-effect `import`, `import()`, `require()` | it is relative, uses an alias (`@/`, `~/`, `src/`), or is a `baseUrl` path whose first folder exists under `src/` |
| Python | `.py` | `import a, b as c`, `from … import`, relative imports, also indented (inside `try:` or a function) | it is relative, or its top-level package exists under `src/` (or the root) |
| Go | `.go` | single and grouped `import`, with or without an alias (`x`, `_`, `.`) | it starts with the module path in the nearest `go.mod` |
| SQL | `.sql`, and SQL in string literals of the languages above | tables: `FROM`, `JOIN`, `INTO`, `UPDATE`, `REFERENCES`, `ALTER`/`DROP`/`TRUNCATE`, `CREATE INDEX … ON` | the table is created by a module's migrations (that module owns it) |

SQL has no imports: its dependencies are tables. Two rules apply to it, in `.sql` files and in queries embedded in code alike:

- **SQL lives only in `infrastructure/` and `platform/db/`** (`sql-placement`).
- **Each module uses only its own tables** (`table-ownership`): a table belongs to the module whose migrations create it, and querying, altering or adding a foreign key to another module's table is reported, as is a table created by two modules.

Configuration has one place too (`config-placement`): only `main/` reads the environment (`process.env`, `os.environ`, `os.Getenv`, …) or imports a configuration loader (`dotenv`, `pydantic-settings`, `viper`, …). Only code is read, never comments or strings; a Go `_test.go` file is its own composition root and may read it.

Translations stay out of business code (`i18n-placement`): `domain/`, `application/` and `shared/` never import an i18n library (`i18next`, `react-intl`, `gettext`, `babel`, `go-i18n`, …). They return codes; the presenter or controller writes the text in the request's language.

Embedded SQL is read only from string literals (never comments) that start like a statement; a lower-case one also needs something only SQL has (`where`, `join`, `values`, `?`, `*`, a comma…), so a message such as `"select a customer from the list"` is not taken for a query.

Source files in any other language (Java, Kotlin, C#, …) are **reported as not checked** and the project gets no health score, instead of a misleading 100.

The skills are language-neutral: each `SKILL.md` holds the workflow and the checklist, and the code is in `skills/<skill>/references/{typescript,python,go}.md` (plus `sql.md` for the gateway), one complete example per language on the same `orders`/`customers` domain (plus `loyalty`, which reacts to orders' events, in the `event` skill). Claude reads only the reference for the project's language. Every code block there must parse with its language's own parser (`node scripts/check-snippets.mjs`, run in CI with `--strict`), so the examples use concrete names, never placeholders.

Each profile is verified against its example in [`examples/<language>/`](examples) (SQL against the Go example, whose queries and migrations are `.sql` files): a real application with its own tests, which `verify:example` scans clean and then with planted violations. Adding a language means adding a profile, its example and its checks — the rules themselves do not change.

## Command line: `ca-scan`

The same checks as the `ca_scan` and `ca_cycles` tools, without Claude Code, for CI and the terminal: both axes, SQL placement and table ownership, configuration and i18n placement, and cycles between components. Node.js only, no dependencies.

```bash
npx --yes --package=github:santiago-migoni/clean-architecture ca-scan . --strict
```

Options: `--json` (the full report), `--strict` (warnings fail too). Exit codes: `0` clean, `1` violations or cycles, `2` not reliable (no file in the layout, a legacy layout, or code in a language without a profile), `64` bad usage. Pin a commit or tag (`…/clean-architecture#<ref>`) for reproducible CI. A ready GitHub Actions job is in the `init` skill's references.

Native linters for faster feedback in the editor — ESLint with `eslint-plugin-boundaries`, import-linter, go-arch-lint — are configured in the same references, and `scripts/check-linters.mjs` proves each configuration in both directions in this repository's CI.

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
     Fix: To ask "customers" something: declare a port owned by "orders" (application/ports/output) and implement it in "orders/infrastructure/gateways" by calling "customers/application/ports/input". To react to what "customers" announces: subscribe from "orders/infrastructure/subscribers" to "customers/application/ports/published". Reference "customers" entities from the domain by id only.
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

## Example Projects

[`examples/`](examples) holds one reference application — two modules (`orders`, `customers`), HTTP and SQLite — written in each supported language. Every piece the skills describe appears once, where its trigger holds (an Input Port only where another module calls the use case, a Presenter only where output is formatted, a domain event, the shared kernel, the cross-module recipe), and the guards a happy-path test misses are tested. [`examples/README.md`](examples/README.md) lists every piece and why it is there.

| Language | Project | Run |
|---|---|---|
| TypeScript | [`examples/typescript`](examples/typescript) — Express 5, `node:sqlite`, Vitest, ESLint boundaries | `cd examples/typescript && npm ci && npm test && npm start` |
| Python | [`examples/python`](examples/python) — FastAPI, `sqlite3`, pytest, import-linter | `cd examples/python && pip install -e ".[dev]" && pytest && python -m shop.main` |
| Go | [`examples/go`](examples/go) — `net/http`, `modernc.org/sqlite`, `go test`, go-arch-lint | `cd examples/go && go test -tags integration ./... && go run ./cmd/api` |

## Continuous Integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs two jobs on every pull request and on `main`:

| Job | What it guards |
|---|---|
| **Plugin engine** | Syntax of the MCP server, hook and rules; the JSON manifests; and `npm run verify:example`, which checks the scanner **in both directions**: every example (`examples/typescript`, `examples/python`, `examples/go`) must be clean, and planted violations (outward import, cross-module import, `infrastructure` → `platform`, a file directly under `infrastructure/`, a folder named `modules/` that is not business code, a legacy layout) must be found — in each language's own import syntax, while external packages named like a layer are ignored. A scanner that reports nothing may simply be broken, so a clean result alone proves nothing. |
| **Example** (Node 22.13.0, 22, 24) | `examples/typescript`: `npm ci` from the lockfile, `tsc`, ESLint with the architecture rules, and its 60 tests. |
| **Linters** | `scripts/check-linters.mjs --strict`: the ESLint, import-linter and go-arch-lint configurations the skills recommend pass on their clean project and fail on planted violations of each kind, naming every planted file. |
| **Examples (Python, Go)** | `examples/go` builds, vets and passes its tests with and without the `integration` tag (Go 1.26); `examples/python` installs and passes its tests (Python 3.11). |

Run the engine check locally with `npm run verify:example`.

## Clean Architecture Concepts Covered

**Layers (inside every module):** `domain` (Entities) → `application` (Use Cases) → `infrastructure` (Interface Adapters) → `platform` (Frameworks & Drivers), plus `shared` (shared kernel) and `main` (composition root)

**Modules:** each folder under `src/modules/` is a cohesive component; modules talk only through ports: a call (`A/infrastructure` → `B/application/ports/input`) or a subscription to an event (`B/infrastructure/subscribers` → `A/application/ports/published`)

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
| **Modules** | A module never imports another module's `domain/` or `infrastructure/`. Two legal crossings, both from `infrastructure/`: a call, `A/infrastructure → B/application/ports/input`, through a port owned by A; and a subscription, `B/infrastructure/subscribers → A/application/ports/published`, to an integration event that is plain data (`published-contract`). |

Reserved names that cannot be module names: `shared`, `platform`, `main`, `domain`, `application`, `infrastructure`, `modules`, `bootstrap` and `composition` (aliases of `main`), and `cmd`. `app`, `infra` and `adapters` are not layer folders: a file in `modules/<m>/app/` is reported as outside the layout.

### Migrating from a layer-first layout

A project laid out by layer (`src/{entities,usecases,adapters,frameworks,main}/`) is reported by `ca_scan` and gets no score. Run `/clean-architecture:migrate src/` to move to modules. Mapping: `entities → modules/<m>/domain`, `usecases → modules/<m>/application`, `adapters → modules/<m>/infrastructure`, `frameworks → platform`. File names are now kebab-case (`create-order`, `sql-order-repository`) instead of `ICreateOrderUseCase` / `OrderRepositoryImpl`; the class and interface names inside are unchanged.

## License

MIT

## Credits

Maintained by [Santiago Migoni](https://github.com/santiago-migoni). Originally created by [Marcos Tawadros (MorcosS)](https://github.com/morcoss). Released under the [MIT license](LICENSE).
