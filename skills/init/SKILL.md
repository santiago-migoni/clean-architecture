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
2. **Identify the modules** from the description. Each module is a business capability (`orders`, `customers`, `billing`), named in kebab-case. The architecture must scream the domain, not the framework (Screaming Architecture principle). If the user names only one capability, create one module; if the description is vague, ask for the module names rather than inventing a generic one.
3. **Create the lean directory structure** below: `domain/`, `application/` and `infrastructure/` per module, plus `main/` and `docs/architecture/`. Do NOT create empty folders for things that do not exist yet.
   When the `ca_scaffold` MCP tool is available, use it for this step: call it with `rootPath` (absolute project root), `language`, `domain` and `modules`. It creates exactly this structure (with the `.gitkeep` stubs, `src/main/index.<ext>` and a generic `ARCHITECTURE.md`), rejects reserved module names and never overwrites existing files. Create the folders by hand only when the tool is unavailable, following the same structure.
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

File names are kebab-case (snake_case in Python).

## Files to Generate (for the first module `<module>`)

Keep it minimal — three files plus the composition root.

### 1. Entity (`src/modules/<module>/domain/<entity>.<ext>`)
- Header comment: enterprise business rules; imports at most from `src/shared/`.
- Never imports from `application/`, `infrastructure/`, `platform/`, `main/` or any other module.

### 2. Repository interface (`src/modules/<module>/application/ports/output/<entity>-repository.<ext>`)
- Lives in the `application` layer (not in `infrastructure`), following DIP.

### 3. Interactor stub (`src/modules/<module>/application/interactors/<use-case>.<ext>`)
- Depends on the repository interface; `execute(request)` returns a response model.
- Add an **Input Port** (`application/ports/input/<use-case>.<ext>`) only if another module or a second entry point will call it.
- Add an **Output Port + Presenter** only if output formatting is non-trivial (see the `usecase` and `presenter` skills).

### 4. Domain extras — on demand
`events/`, `errors/` and `services/` inside `domain/` are created when the first domain event, domain error or domain service exists. Do not scaffold them.

### 5. Composition root
- `src/main/index.<ext>` — comment explaining that it is the only file allowed to instantiate concrete classes. If the project will have several entry points (api, worker, cli), use `src/main/<app>/index.<ext>`.

### 6. Rule enforcement
Both axes must be enforced:

- **Axis 1 — layers** (`infrastructure → application → domain`, `infrastructure ↛ platform`).
- **Axis 2 — modules** (no cross-module imports except `A/infrastructure → B/application/ports/input`).

By language:
- **TypeScript/JavaScript**: `eslint.config.js` with `eslint-plugin-boundaries` (element types `shared`, `domain`, `input-port`, `application`, `infrastructure`, `platform`, `main`, each module-scoped one with a `module` capture) — see the tested example below.
- **Python**: `import-linter` contracts (a `layers` contract per module plus a `forbidden` contract between modules).
- **Java/Kotlin**: ArchUnit layered-architecture and package-slice tests.
- **Go**: `go-cleanarch` plus `internal/` packages per module.
- **C#**: NDepend or architecture tests.

Example for TypeScript — `eslint.config.js` (flat config). **Tested** against `eslint@9`, `typescript-eslint@8` and `eslint-plugin-boundaries@7`, which uses the `boundaries/dependencies` rule with `policies` (older versions used `boundaries/element-types` with a different syntax — check the installed major version before copying):

```js
// eslint.config.js — enforces the Dependency Rule (layers) and the Module Rule (modules).
// Written for eslint-plugin-boundaries v7 (`boundaries/dependencies` + policies).
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

// Same module as the importing file
const same = (type) => ({
  element: { type, captured: { module: '{{ from.element.captured.module }}' } },
});
// Any file of that type
const any = (type) => ({ element: { type } });

// from → [allowed targets]
const rule = (from, ...targets) =>
  targets.map((to) => ({ from: { element: { type: from } }, allow: { to } }));

export default [
  { files: ['src/**/*.ts'], languageOptions: { parser: tseslint.parser } },
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/include': ['src/**/*'],
      // Order matters: the first matching descriptor wins, so `input-port` precedes `application`.
      'boundaries/elements': [
        { type: 'shared',         pattern: 'src/shared',                            partialMatch: false },
        { type: 'domain',         pattern: 'src/modules/*/domain',                  partialMatch: false, capture: ['module'] },
        { type: 'input-port',     pattern: 'src/modules/*/application/ports/input', partialMatch: false, capture: ['module'] },
        { type: 'application',    pattern: 'src/modules/*/application',             partialMatch: false, capture: ['module'] },
        { type: 'infrastructure', pattern: 'src/modules/*/infrastructure',          partialMatch: false, capture: ['module'] },
        { type: 'platform',       pattern: 'src/platform',                          partialMatch: false },
        { type: 'main',           pattern: 'src/main',                              partialMatch: false },
      ],
    },
    rules: {
      'boundaries/dependencies': [2, {
        default: 'disallow',
        policies: [
          // Layers — inward only, and only inside the SAME module
          ...rule('domain',      { element: { type: 'shared' } }, same('domain')),
          ...rule('application', { element: { type: 'shared' } }, same('domain'), same('application'), same('input-port')),
          ...rule('input-port',  { element: { type: 'shared' } }, same('domain'), same('application'), same('input-port')),
          ...rule('infrastructure', { element: { type: 'shared' } }, same('domain'), same('application'), same('input-port'),
                            same('infrastructure'),
                            // The ONE legal cross-module edge: infrastructure → another module's application/ports/input
                            any('input-port')),
          ...rule('platform', any('shared'), any('domain'), any('application'), any('input-port'), any('infrastructure'),
                  any('platform')),
          ...rule('main', any('shared'), any('domain'), any('application'), any('input-port'), any('infrastructure'),
                  any('platform'), any('main')),
        ],
      }],
    },
  },
];
```

Install: `npm i -D eslint typescript typescript-eslint eslint-plugin-boundaries eslint-import-resolver-typescript` (do **not** add `@eslint/js` pinned to a different ESLint major — it fails with `ERESOLVE`).

Notes for the generated project:
- `tsconfig.json`: use `"paths": { "@/*": ["./src/*"] }` **without `baseUrl`** (deprecated in TypeScript 6 and an error without `ignoreDeprecations`).
- `tsconfig.json`: TypeScript 6 no longer includes `@types/*` automatically — if the code uses Node built-ins (`node:fs`, `node:sqlite`, `node:crypto`), install `@types/node` and set `"types": ["node"]`.
- Do not name a folder under `src/main/` `modules/`: use `src/main/compose/`. `src/modules/` is the business code, and the same name in two places confuses people.
- The `input-port` element must come **before** `application` in `boundaries/elements`: the first matching descriptor wins, and `application/ports/input` is the only place another module may reach.
- The whole `src/modules/*/infrastructure` folder is the infrastructure layer, not just `infrastructure`.
- After generating the config, verify it by temporarily adding a file that imports outward (for example a `domain/` file importing from `application/`) and checking that ESLint reports it, then delete it. A config that reports nothing may simply not be matching your folders.

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
