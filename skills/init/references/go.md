# Project setup and rule enforcement — Go

Layout: `internal/modules/<module>/{domain,application,infrastructure}`, `internal/shared/`, `internal/platform/`, `internal/bootstrap/` (composition root) and `cmd/<app>/main.go`; no `src/`. Module folders are one lowercase word; tests are `_test.go` files beside the code.

## go.mod

```text
go mod init example.com/shop
```

The module path is the import root: `example.com/shop/internal/modules/orders/domain`. `ca_scan` reads it from `go.mod` to tell the project's imports from external ones.

## Enforcing both axes

The compiler forbids import cycles and `internal/` keeps other repositories out, but nothing stops one module from importing another module's `domain/`. Two ways to enforce the rules:

**go-arch-lint**, configured per module: one component per layer of each module, and the single legal cross-module edge listed explicitly. Tested with go-arch-lint v1.19.2 on the plugin's Go fixture, in both directions (clean, and failing on planted violations of each kind):

```yaml
# go-arch-lint (v1.19, config v3): both axes, declared per module.
# Layers point inward inside a module; the only edge between modules is
# orders/infrastructure -> customers/application/ports/input.
# shared depends on nothing, so it has no entry under deps. A module's ports/input component
# exists only once the folder does (go-arch-lint rejects a glob that matches nothing).
version: 3
workdir: internal

allow:
  # deepScan reports the composition root injecting an implementation into a use case
  # (infrastructure passed to application) as a violation: that injection IS the Dependency
  # Inversion this architecture relies on. Imports are what the rules constrain.
  deepScan: false

components:
  shared:                  { in: shared/** }
  platform:                { in: platform/** }
  bootstrap:               { in: bootstrap/** }

  customers-domain:        { in: modules/customers/domain/** }
  customers-input:         { in: modules/customers/application/ports/input/** }
  customers-application:   { in: modules/customers/application/** }
  customers-infrastructure: { in: modules/customers/infrastructure/** }

  orders-domain:           { in: modules/orders/domain/** }
  orders-application:      { in: modules/orders/application/** }
  orders-infrastructure:   { in: modules/orders/infrastructure/** }

deps:
  platform:
    mayDependOn: [shared]
  bootstrap:
    anyProjectDeps: true

  customers-domain:
    mayDependOn: [shared]
  customers-input:
    mayDependOn: [customers-domain, shared]
  customers-application:
    mayDependOn: [customers-application, customers-input, customers-domain, shared]
  customers-infrastructure:
    mayDependOn: [customers-application, customers-input, customers-domain, shared]

  orders-domain:
    mayDependOn: [shared]
  orders-application:
    mayDependOn: [orders-application, orders-domain, shared]
  orders-infrastructure:
    mayDependOn: [orders-application, orders-domain, shared, customers-input]
```

Keep `deepScan: false`: it would report the composition root injecting implementations into use cases, which is the Dependency Inversion itself. Add a component for `application/ports/input/**` only once the folder exists (a glob that matches nothing is an error), and list every new module.

**ca-scan** (below) needs no per-module configuration and also checks SQL and cycles.

## In CI: ca-scan

`ca-scan` runs the plugin's checks without Claude Code: both axes, SQL placement and table ownership, and cycles between components. It needs only Node.js (no dependencies). Exit codes: `0` clean, `1` violations or cycles (with `--strict`, also any warning), `2` not reliable (no file in the layout, a legacy layout, or code in a language without a profile).

```yaml
# .github/workflows/architecture.yml
name: Architecture
on: [push, pull_request]
jobs:
  ca-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      # Pin the plugin to a commit or tag for reproducible builds: github:santiago-migoni/clean-architecture#<ref>
      - run: npx --yes --package=github:santiago-migoni/clean-architecture ca-scan . --strict
```
