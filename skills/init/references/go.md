# Project setup and rule enforcement — Go

Layout: `internal/modules/<module>/{domain,application,infrastructure}`, `internal/shared/`, `internal/platform/`, `internal/bootstrap/` (composition root) and `cmd/<app>/main.go`; no `src/`. Module folders are one lowercase word; tests are `_test.go` files beside the code.

## go.mod

```text
go mod init example.com/shop
```

The module path is the import root: `example.com/shop/internal/modules/orders/domain`. `ca_scan` reads it from `go.mod` to tell the project's imports from external ones.

## Enforcing both axes

The compiler forbids import cycles and `internal/` keeps other repositories out, but nothing stops one module from importing another module's `domain/`. `ca_scan` checks both axes on Go imports (and SQL placement and table ownership). `go-arch-lint` can enforce the layer axis natively; it cannot express "the same module only", so the Module Rule stays with `ca_scan`.

```yaml
# .go-arch-lint.yml — layer axis only, for the orders module (repeat per module)
version: 3
workdir: internal
components:
  orders-domain: { in: modules/orders/domain/** }
  orders-application: { in: modules/orders/application/** }
  orders-infrastructure: { in: modules/orders/infrastructure/** }
  shared: { in: shared/** }
deps:
  orders-domain: { mayDependOn: [shared] }
  orders-application: { mayDependOn: [orders-domain, shared] }
  orders-infrastructure: { mayDependOn: [orders-application, orders-domain, shared] }
```
