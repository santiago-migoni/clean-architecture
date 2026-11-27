---
name: init
description: "This skill should be used when the user asks to \"start a new project with Clean Architecture\", \"scaffold a feature-first project\", \"set up modules with domain/application/infrastructure\", \"initialize the clean-architecture layout\", or wants to retrofit an empty repository with the src/modules/<module>/{domain,application,infrastructure} structure, the composition root and the lint rules that enforce the Dependency Rule and the Module Rule."
argument-hint: "[description of the project and its modules]"
---
You are a Clean Architecture expert following Robert C. Martin's book *Clean Architecture: A Craftsman's Guide to Software Structure and Design*.

The user wants to initialize a new project (or retrofit an existing one) with a full Clean Architecture structure. Arguments provided after the command describe the project domain/technology.

The plugin uses a **feature-first** layout: business capabilities are **modules** under `src/modules/`, and every module has the three layers `domain`, `application` and `infrastructure`.

## Your Task

1. **Detect the language and framework** from the project context (check package.json, go.mod, pom.xml, Pipfile, etc.). If none exists, infer from the user's description.
2. **Identify the modules** from the description. Each module is a business capability (`orders`, `customers`, `billing`), named as the language's conventions say (kebab-case in TypeScript, snake_case in Python, one lowercase word in Go — see "Language conventions" in the `rules` skill). The architecture must scream the domain, not the framework (Screaming Architecture principle). If the user names only one capability, create one module; if the description is vague, ask for the module names rather than inventing a generic one.
3. **Create the lean directory structure** below: `domain/`, `application/` and `infrastructure/` per module, plus `main/` and `docs/architecture/`. Do NOT create empty folders for things that do not exist yet.
   When the `ca_scaffold` MCP tool is available, use it for this step: call it with `rootPath` (absolute project root), `language` (`typescript`, `javascript`, `python` or `go`), `domain` and `modules`. It creates this structure in the language's own layout (below: TypeScript/JavaScript, then Python and Go), with names adapted to the language, the composition root stub and a generic `ARCHITECTURE.md`; it rejects reserved or invalid module names and any other language, and never overwrites existing files. Follow its `nextSteps`. Create the folders by hand only when the tool is unavailable, following the same structure.
4. **Generate a minimal base set of files** for the first module: an entity, a repository interface and an interactor stub.
5. **Create the architecture doc** at `docs/architecture/ARCHITECTURE.md` (never inside `src/`).
6. **Enforce both rules from the start** (Dependency Rule and Module Rule) by setting up linting rules or module boundary checks appropriate to the language.

Module names `shared`, `platform`, `main`, `domain`, `application`, `infrastructure`, `modules`, `bootstrap`, `composition`, `app`, `infra` and `adapters` are reserved — they would be ambiguous with layer folders.

## Directory Structure to Create

Create only this:

```
<project-root>/
├── src/
│   ├── modules/
│   │   └── <module>/                       # repeat per module
│   │       ├── domain/                     # Enterprise Business Rules
│   │       ├── application/                # Application Business Rules
│   │       └── infrastructure/             # Interface Adapters (detail)
│   └── main/
│       └── index.<ext>                     # Composition Root — the only place dependencies are wired
├── docs/
│   └── architecture/
│       └── ARCHITECTURE.md
└── <config files>
```

Everything else is **created on demand** by the first file that needs it (the skills do this): never scaffold it empty.

```
src/shared/                                                         # shared kernel — only when two modules truly share a type
src/platform/{web,db,external}/                                     # frameworks & drivers — when the first framework wiring appears
src/main/<app>/index.<ext>                                          # instead of main/index when there are several entry points
src/modules/<m>/domain/{events,errors,services}/                    # when the first event / domain error / domain service exists
src/modules/<m>/application/ports/input/                            # only if another module or a second entry point calls the use case
src/modules/<m>/application/ports/output/                           # repository interface and other outbound ports
src/modules/<m>/application/interactors/                            # use case implementations
src/modules/<m>/infrastructure/{controllers,presenters,gateways}/   # presenters only if the use case has an Output Port
src/modules/<m>/infrastructure/gateways/{in-memory,migrations}/
tests/<module>/unit/                                                # mirrors src/modules/<module>/
tests/<module>/integration/                                         # flat: gateway tests against a real DB
tests/e2e/
```

File names are kebab-case (snake_case in Python and Go).

### Go

Go has no `src/`, keeps its tests beside the code and splits the composition root in two. `ca_scaffold` with `language: "go"` creates:

```
<project-root>/
├── go.mod                                      # create it with `go mod init <module-path>` if missing
├── cmd/<app>/main.go                           # entry point: calls bootstrap, runs the app
├── internal/
│   ├── bootstrap/bootstrap.go                  # composition root — the only place dependencies are wired
│   └── modules/<module>/                       # one lowercase word: orders, orderhistory
│       ├── domain/
│       ├── application/
│       └── infrastructure/
└── docs/architecture/ARCHITECTURE.md
```

On demand, as in the other languages: `internal/shared/`, `internal/platform/<driver>/`, `application/ports/{input,output}/`, `application/interactors/`, `infrastructure/gateways/{inmemory,migrations}/`. Tests are `<file>_test.go` in the same package; gateway tests against a real database carry `//go:build integration` and run with `go test -tags integration ./...`. Imports of same-named packages from several modules are aliased `<module><package>` (`ordersinteractors`).

### Python

Python uses the `src/` layout with the code inside one package, so that `modules`, `shared` or `platform` never become top-level packages (`import platform` must stay the standard library). `ca_scaffold` with `language: "python"` creates:

```
<project-root>/
├── pyproject.toml                              # add it if missing: [tool.setuptools.packages.find] where = ["src"]
├── src/<package>/                              # named after pyproject.toml's project name, else the domain
│   ├── __init__.py
│   ├── main/__main__.py                        # composition root and entry point: python -m <package>.main
│   └── modules/<module>/                       # snake_case: orders, order_history
│       ├── domain/__init__.py
│       ├── application/__init__.py
│       └── infrastructure/__init__.py
└── docs/architecture/ARCHITECTURE.md
```

Every folder is a package: its `__init__.py` takes the place of the `.gitkeep` and stays. On demand: `src/<package>/shared/`, `src/<package>/platform/<driver>/`, `application/ports/{input,output}/`, `application/interactors/`, `infrastructure/gateways/{in_memory,migrations}/`, and `tests/<module>/{unit,integration}/` with pytest. Imports between modules are absolute (`from <package>.modules.customers.application.ports.input.get_customer import GetCustomer`); inside a module, relative imports are fine.

## Files to Generate (for the first module `<module>`)

Keep it minimal — three files plus the composition root.

### 1. Entity (in the module's `domain/`)
- Header comment: enterprise business rules; imports at most from `shared/`.
- Never imports from `application/`, `infrastructure/`, `platform/`, the composition root or any other module. See the `entity` skill and its language references.

### 2. Repository interface (in the module's `application/ports/output/`)
- Lives in the `application` layer (not in `infrastructure`), following DIP.

### 3. Interactor stub (in the module's `application/interactors/`)
- Depends on the repository interface; `execute(request)` returns a response model.
- Add an **Input Port** (`application/ports/input/`) only if another module or a second entry point will call it.
- Add an **Output Port + Presenter** only if output formatting is non-trivial (see the `usecase` and `presenter` skills).

### 4. Domain extras — on demand
`events/`, `errors/` and `services/` inside `domain/` are created when the first domain event, domain error or domain service exists. Do not scaffold them.

### 5. Composition root
- TypeScript/JavaScript: `src/main/index` — comment explaining that it is the only file allowed to construct concrete classes. With several entry points (api, worker, cli), `src/main/<app>/index`.
- Python: `src/<package>/main/__main__.py`, run with `python -m <package>.main`.
- Go: `internal/bootstrap/bootstrap.go` wires everything and returns the app; each `cmd/<app>/main.go` only calls it and runs.

### 6. Rule enforcement
Both axes must be enforced:

- **Axis 1 — layers** (`infrastructure → application → domain`, `infrastructure ↛ platform`).
- **Axis 2 — modules** (no cross-module imports except `A/infrastructure → B/application/ports/input`).

**Before setting it up, read the reference for the project's language** — it has the tested configuration and the setup files:

- [TypeScript / JavaScript](references/typescript.md) — ESLint with `eslint-plugin-boundaries` (tested in `examples/typescript`)
- [Python](references/python.md) — `pyproject.toml` and import-linter contracts (tested)
- [Go](references/go.md) — `go.mod` and a go-arch-lint configuration per module (tested)

Every reference also has the CI job for `ca-scan`, the plugin's command-line scan: it checks both axes in every supported language (TypeScript/JavaScript, Python, Go), plus SQL placement, table ownership, configuration and i18n placement, and cycles, with no per-module configuration. A native linter adds faster feedback in the editor; the configurations in the references are proven in both directions by the plugin's own CI. After setting up a linter, verify it: add a file that imports outward (a `domain/` file importing from `application/`), check that the linter reports it, then delete it. A configuration that reports nothing may simply not be matching your folders.

### 7. Architecture README (`docs/architecture/ARCHITECTURE.md`)
The scaffold only writes a **generic stub**: once the modules exist, rewrite it so it describes THIS project (its modules, which optional pieces each use case has and why, the cross-module links, the decisions taken) instead of leaving the template text. Explain the layout, both rules, the optional pieces (input port, output port + presenter), the cross-module recipe (port owned by the caller, implemented in its `infrastructure`, calling the other module's input port), where tests, docs and migrations live, and how to add a new module or feature.

## Validation Before Finishing

After creating files, verify:
- [ ] No file in `domain/` imports from `application/`, `infrastructure/`, `platform/`, `main/`, or another module.
- [ ] No file in `application/` imports from `infrastructure/`, `platform/`, `main/`, or another module.
- [ ] No file in `infrastructure/` imports from `platform/` or `main/`; the only cross-module import allowed is into another module's `application/ports/input/`.
- [ ] `shared/` imports nothing.
- [ ] `main/` is the ONLY place where concrete classes are instantiated and wired together.
- [ ] Port interfaces live in the `application/` layer of the module that owns them, not in `infrastructure/`.
- [ ] No empty folders were created beyond `domain/`, `application/` and `infrastructure/` per module, `main/` and `docs/architecture/`.
- [ ] Documentation is in `docs/architecture/`, not in `src/`, and `ARCHITECTURE.md` describes this project rather than the generic stub.
- [ ] No `.gitkeep` is left in a folder that now contains other files (the scaffold creates them in `domain/`, `application/` and `infrastructure/`; delete each one when its folder gets its first real file).
- [ ] No module name is reserved.

## Output

After creating all files, provide a summary table showing:
- Each module and layer, and what was created
- The dependency map for this specific project (layers and modules)
- Next steps (e.g., "run `/clean-architecture:entity <module>/Order` to create your first entity")
