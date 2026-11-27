# Project setup and rule enforcement — Python

Layout: `src/<package>/modules/<module>/{domain,application,infrastructure}`, `src/<package>/shared/`, `src/<package>/platform/`, `src/<package>/main/`; tests in `tests/`. Every folder is a package (`__init__.py`). The code lives inside one package so that `modules`, `shared` or `platform` never become top-level packages: `import platform` must stay the standard library.

## pyproject.toml

```toml
[project]
name = "shop"
version = "0.1.0"
requires-python = ">=3.10"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
where = ["src"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

`python -m shop.main` runs the composition root; `pytest tests/*/unit` runs the fast suite.

## Both axes with import-linter

One `layers` contract per module (the layers of a module, outermost first) and one `independence` contract between modules, with the single legal edge ignored:

```toml
[tool.importlinter]
root_package = "shop"

[[tool.importlinter.contracts]]
name = "orders: layers point inward"
type = "layers"
layers = ["shop.modules.orders.infrastructure", "shop.modules.orders.application", "shop.modules.orders.domain"]

[[tool.importlinter.contracts]]
name = "customers: layers point inward"
type = "layers"
layers = ["shop.modules.customers.infrastructure", "shop.modules.customers.application", "shop.modules.customers.domain"]

[[tool.importlinter.contracts]]
name = "modules do not import each other (except another module's input port)"
type = "independence"
modules = ["shop.modules.orders", "shop.modules.customers"]
ignore_imports = ["shop.modules.orders.infrastructure.** -> shop.modules.customers.application.ports.input.**"]
```

Run it with `lint-imports`. Add a contract (and a module to the independence list) for every new module. `ca_scan` checks the same rules without per-module configuration, plus SQL placement and table ownership.
