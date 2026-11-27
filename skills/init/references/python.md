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

Tested with import-linter 2.17 on the plugin's Python fixture, in both directions (clean, and failing on planted violations of each kind). One `layers` contract covers every module through `containers`; a `forbidden` contract keeps the drivers out; an `independence` contract keeps modules apart, with the single legal edge ignored.

```toml
[tool.importlinter]
root_package = "shop"

[[tool.importlinter.contracts]]
name = "Layers point inward inside every module"
type = "layers"
containers = ["shop.modules.orders", "shop.modules.customers"]
layers = ["infrastructure", "application", "domain"]

[[tool.importlinter.contracts]]
name = "Modules never import platform or main (drivers are injected)"
type = "forbidden"
source_modules = ["shop.modules"]
forbidden_modules = ["shop.platform", "shop.main"]

[[tool.importlinter.contracts]]
name = "Modules do not import each other, except another module's input port from infrastructure"
type = "independence"
modules = ["shop.modules.orders", "shop.modules.customers"]
ignore_imports = ["shop.modules.*.infrastructure.** -> shop.modules.*.application.ports.input.**"]
```

Add each new module to `containers` and `modules`. Run it with `PYTHONPATH=src lint-imports` (or install the package in the environment first). import-linter 2.16 and later need Python 3.11 or newer to run; they still check a codebase that targets Python 3.10, so in CI install the linter on a newer Python than the project's minimum if needed.

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

import-linter gives feedback before commit; `ca-scan` adds SQL placement, table ownership and cycles.
