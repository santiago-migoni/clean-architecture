# Clean Architecture Plugin — Global Instructions

This project uses the **Clean Architecture** plugin. All code you write or review must conform to the principles established by Robert C. Martin in *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The plugin uses a **feature-first** layout: the code is grouped into **modules** (`orders`, `customers`, …) and every module contains the three layers `domain`, `app` and `infra`.

## Project Layout

```
<project-root>/
├── src/
│   ├── modules/
│   │   └── <module>/          # one folder per business capability (screams the domain)
│   │       ├── domain/        # Enterprise business rules
│   │       ├── app/           # Application business rules
│   │       │   ├── ports/{input,output}/
│   │       │   └── interactors/
│   │       └── infra/
│   │           └── adapters/{controllers,presenters,gateways}/
│   ├── shared/                # Shared kernel — pure and minimal
│   ├── platform/              # Frameworks & drivers: web, db, external
│   └── main/                  # Composition root (main/<app>/ if there are several entry points)
├── tests/
│   ├── <module>/{unit,integration}/    # mirrors src/modules/<module>/
│   └── e2e/
├── docs/architecture/         # ARCHITECTURE.md, diagrams, ADRs (never inside src/)
└── <config files>
```

**Create on demand.** `init` creates only `modules/<m>/{domain,app,infra}`, `main/` and `docs/architecture/`. `shared/`, `platform/`, the `ports/`, `interactors/` and `adapters/` subfolders, `in-memory/` and the test folders are created by the first file that needs them — never as empty folders. The same applies to `domain/{events,errors,services}`: add them when the first event, domain error or domain service exists.

**`.gitkeep` files** exist only so that git keeps an otherwise-empty folder. The scaffold writes one into each of `domain/`, `app/` and `infra/`: **delete a folder's `.gitkeep` in the same change that adds its first real file.** A `.gitkeep` next to other files is leftover noise.

**Macro decisions.**
- Tests are grouped by module (`tests/<module>/{unit,integration}`) so that removing or extracting a module means deleting `src/modules/<m>` and `tests/<m>`. `tests/e2e/` is shared.
- Documentation lives only in `docs/architecture/`.
- One entry point → `src/main/index`. Several (api, worker, cli) → `src/main/<app>/index`, all sharing the modules. A monorepo (`apps/`, `packages/`) is justified only for separately deployed artifacts.
- Database migrations live with their module (`infra/adapters/gateways/migrations/`); the connection and the runner live in `platform/db/`.

File names are kebab-case (snake_case in Python): `create-order`, `order-repository`, `sql-order-repository`.

## Non-Negotiable Rules

### 1. The Dependency Rule (axis 1 — layers)
Source code dependencies MUST point only **inward** — toward higher-level policy.

```
domain  ←  app  ←  infra/adapters  ←  platform
(inner)                               (outer)
```

| Book term | This layout |
|---|---|
| Entities | `domain` |
| Use Cases | `app` |
| Interface Adapters | `infra/adapters` |
| Frameworks & Drivers | `platform` |

- Outer layers may depend on inner layers.
- Inner layers MUST NEVER import from outer layers.
- If an inner layer needs to call an outer layer, use a **boundary interface** (DIP).
- `infra/adapters` MUST NOT import from `platform`: the framework client (DB connection, HTTP client) is injected from `main/`.

### 2. Layer Responsibilities

| Layer | Folder | Contains | May depend on |
|---|---|---|---|
| domain | `src/modules/<m>/domain/` | Enterprise business rules, entities, value objects | `shared` only |
| app | `src/modules/<m>/app/` | Application business rules, interactors, input/output ports | `domain`, `shared` |
| infra | `src/modules/<m>/infra/adapters/` | Controllers, Presenters, Gateways | `app`, `domain`, `shared` |
| shared | `src/shared/` | Shared kernel: `Money`, `Id`, base errors | Nothing |
| platform | `src/platform/` | Web, DB, external tools | All inner layers |
| main | `src/main/` | Composition root, wiring | Everything |

### 3. The Module Rule (axis 2 — modules)
A module is a cohesive component (CCP/CRP): it changes and is deployed as a unit.

- A module MUST NOT import another module's `domain/` or `infra/`.
- The **only** legal crossing is `A/infra/adapters` → `B/app/ports/input`, through a port **owned by A**:
  1. `A/app/ports/output/` declares the port it needs (e.g. `customer-lookup`).
  2. `A/infra/adapters/gateways/` implements it by calling `B/app/ports/input/`.
  3. `A/domain` refers to B's entities **by id only** (`customerId`), never by importing them.
- `shared/` is the only code modules may share. Keep it minimal, pure and free of business policy that belongs to a module.
- Cycles between modules are forbidden (ADP).

### 4. Domain (Entities)
- Must contain only enterprise-wide business rules.
- Must have NO knowledge of use cases, databases, UI, or frameworks.
- Can be plain objects, classes, or sets of functions.
- Must be the most stable code in the system.

### 5. App (Use Cases)
- Orchestrate the flow of data to/from entities.
- The interactor lives in `app/interactors/`; the interfaces to the outside it needs (repository, payment, clock, …) live in `app/ports/output/`.
- **Input Port** (`app/ports/input/`): **required** when another module or a second entry point calls the use case; otherwise optional — a controller in the same module may depend on the interactor directly (the dependency still points inward: infra → app).
- **Output Port + Presenter**: **optional**. By default the interactor returns a response model. Use an Output Port when output formatting is non-trivial or several delivery mechanisms exist.
- MUST NOT know about HTTP, SQL, UI, or any framework.

### 6. Infra (Interface Adapters)
- **Controllers**: Convert framework input (HTTP request, CLI args) → use case input model.
- **Presenters** (when the use case uses an Output Port): Implement the Output Port; convert use case output model → view model.
- **Gateways**: Implement repository interfaces defined in `app/ports/output/`; translate between domain objects and DB rows.

### 7. Platform (Frameworks & Drivers)
- Thin adapters that plug into the architecture: route registration, DB connection, third-party clients.
- All framework-specific *wiring* lives here.
- The DB is a detail. The web is a detail. Frameworks are details.

### 8. SOLID Principles
Always apply:
- **SRP**: A module should have one, and only one, reason to change.
- **OCP**: Open for extension, closed for modification.
- **LSP**: Subtypes must be substitutable for their base types.
- **ISP**: Do not depend on interfaces you don't use.
- **DIP**: Depend on abstractions, not concretions.

### 9. Screaming Architecture
`src/modules/` MUST scream the domain (`orders`, `customers`, `billing`), NOT the framework (not `rails/`, `django/`, `spring/`, not `controllers/` at the top level).
Reserved names that may not be used as a module name: `shared`, `platform`, `main`, `app`, `domain`, `infra`, `modules`, `adapters`, `bootstrap`, `composition` (the last two are aliases of `main`).

### 10. Humble Object Pattern
Split every object that touches a boundary (UI, DB, network) into two parts:
1. **Humble Object**: Hard-to-test, thin; just calls the framework.
2. **Testable Object**: Contains all logic; framework-independent.
Use this for Presenters, Views, and Database Gateways.

### 11. Test Boundary
- Tests are part of the outermost circle — they depend on inner layers but nothing depends on them.
- Use case tests must NOT touch the DB, web, or UI.
- Domain tests must NOT touch use cases.
- Follow the same Dependency Rule and Module Rule for test code.

## When Reviewing or Writing Code

Always check:
1. Does any import in an inner layer reference an outer layer path?
2. Does any module import another module's `domain/` or `infra/` (other than `adapters → app/ports/input`)?
3. Do entities contain application or framework logic?
4. Do use cases reference HTTP status codes, SQL, or ORMs?
5. Are port interfaces (repository, input, output) defined in the `app` layer of the module that owns them?
6. Is `main/` the ONLY place where dependencies are wired together?
7. Does each component have a single axis of change (SRP)?
8. Are there cyclic dependencies between modules or layers?

## Available Skills

Where a skill takes `<module>/<Name>`, the module prefix selects the folder under `src/modules/`. If the project has a single module it may be omitted.

- `/clean-architecture:init [description]` — Scaffold project
- `/clean-architecture:entity [module/Name]` — Create entity
- `/clean-architecture:usecase [module/Name]` — Create use case
- `/clean-architecture:controller [module/Name]` — Create controller
- `/clean-architecture:presenter [module/Name]` — Create presenter
- `/clean-architecture:gateway [module/Name]` — Create gateway
- `/clean-architecture:boundary [description]` — Define boundary
- `/clean-architecture:solid [path]` — SOLID audit
- `/clean-architecture:components [path]` — Component cohesion/coupling audit
- `/clean-architecture:check` — Dependency Rule and Module Rule scan
- `/clean-architecture:review` — Full architecture review
- `/clean-architecture:test [module/Name]` — Create compliant tests
- `/clean-architecture:main` — Create/update composition root
- `/clean-architecture:diagram` — Generate architecture diagrams
- `/clean-architecture:migrate [path]` — Migrate existing code
