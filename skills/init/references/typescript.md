# Project setup and rule enforcement — TypeScript / JavaScript

Layout: `src/modules/<module>/{domain,application,infrastructure}`, `src/shared/`, `src/platform/`, `src/main/`; tests in `tests/`. Imports may use the `@/` alias for `src/`.

## ESLint: both axes as lint errors

`eslint.config.js` (flat config), the one `examples/shop` runs in CI. **Tested** against `eslint@9`, `typescript-eslint@8` and `eslint-plugin-boundaries@7`, which uses the `boundaries/dependencies` rule with `policies` (older versions used `boundaries/element-types` with a different syntax — check the installed major version before copying):

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

`scripts/check-linters.mjs` in the plugin proves this configuration in both directions on `examples/shop`: clean, and failing on planted violations of each kind.

## In CI: ca-scan

`ca-scan` runs the plugin's checks without Claude Code: both axes, SQL placement and table ownership, and cycles between components. It needs only Node.js (no dependencies). Exit codes: `0` clean, `1` violations or cycles (with `--strict`, also any warning), `2` not reliable (legacy layout, or code in a language without a profile).

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

ESLint gives feedback in the editor; `ca-scan` adds what ESLint cannot see (SQL, cycles between modules).
