# OrderManagement — Architecture

## Layout

```
src/
├── modules/<module>/{domain, app, infra}   # business code, one folder per module
├── shared/                                 # shared kernel — create only when needed
├── platform/                               # web, db, external — create only when needed
└── main/                                   # composition root (main/<app>/ if several entry points)
tests/
├── <module>/{unit, integration}/
└── e2e/
docs/architecture/                          # this file, diagrams, ADRs
```

Subfolders (`app/ports/{input,output}`, `app/interactors`, `infra/adapters/{controllers,presenters,gateways}`, `domain/{events,errors,services}`) are created by the first file that needs them.

## Layers (inside each module)

| Layer | Path | May import |
|---|---|---|
| domain | `modules/<m>/domain/` | shared |
| app | `modules/<m>/app/` | domain, shared |
| infra | `modules/<m>/infra/adapters/` | app, domain, shared |
| platform | `platform/` | everything inward |
| main | `main/` | everything — imported by no one |

## Dependency Rule

Source code dependencies point **inward only**: infra → app → domain.

## Module Rule

A module never imports another module's `domain/` or `infra/`.
The only legal crossing is `A/infra/adapters` → `B/app/ports/input`, through a port owned by A.

## Optional pieces

- **Input Port** — required when another module (or a second entry point) calls the use case; otherwise the controller may depend on the interactor directly.
- **Output Port + Presenter** — use when output formatting is non-trivial or several delivery mechanisms exist; otherwise the interactor returns a response model.
- **Migrations** live with their module (`infra/adapters/gateways/migrations/`); the connection and runner live in `platform/db/`.
