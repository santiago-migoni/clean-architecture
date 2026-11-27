#!/usr/bin/env node
/**
 * The native linter configurations the skills recommend must really enforce the rules, in BOTH
 * directions: each one passes on its clean project, and fails on a copy with planted violations,
 * naming every planted file. A configuration that reports nothing may simply match no folder.
 *
 *   ESLint + eslint-plugin-boundaries  examples/typescript/eslint.config.js   (npm ci in examples/typescript)
 *   import-linter                      examples/python/pyproject.toml   (pip install -e ".[dev]" there; Python >= 3.11)
 *   go-arch-lint                       examples/go/.go-arch-lint.yml    (go install github.com/fe3dback/go-arch-lint@v1.19.2; Go >= 1.26)
 *
 *   node scripts/check-linters.mjs            # skips a linter that is not installed
 *   node scripts/check-linters.mjs --strict   # a missing linter is a failure (CI)
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const SHOP = join(ROOT, 'examples/typescript');

const LINTERS = [
  {
    name: 'ESLint (eslint-plugin-boundaries)',
    project: SHOP,
    copy: ['src', 'eslint.config.js', 'tsconfig.json', 'package.json'],
    link: ['node_modules'],
    command: () => [join(SHOP, 'node_modules/.bin/eslint'), ['src/**/*.ts']],
    available: () => existsSync(join(SHOP, 'node_modules/.bin/eslint')),
    plant: {
      'src/modules/orders/domain/planted-outward.ts': "import { PlaceOrderInteractor } from '../application/interactors/place-order';\nexport const x = PlaceOrderInteractor;\n",
      'src/modules/orders/application/interactors/planted-cross.ts': "import { Customer } from '../../../customers/domain/customer';\nexport type Y = Customer;\n",
      'src/modules/orders/infrastructure/gateways/planted-platform.ts': "import { createDbConnection } from '../../../../platform/db/connection';\nexport const z = createDbConnection;\n",
      'src/modules/orders/infrastructure/gateways/planted-infra.ts':
        "import { SqlCustomerRepository } from '../../../customers/infrastructure/gateways/sql-customer-repository';\nexport const w = SqlCustomerRepository;\n",
    },
  },
  {
    name: 'import-linter',
    project: join(ROOT, 'examples/python'),
    command: () => ['lint-imports', ['--no-cache']],
    env: { PYTHONPATH: 'src' },
    available: () => !spawnSync('lint-imports', ['--help']).error,
    plant: {
      'src/shop/modules/orders/domain/planted_outward.py': 'def late():\n    from ..application.interactors.place_order import PlaceOrderInteractor\n    return PlaceOrderInteractor\n',
      'src/shop/modules/orders/application/interactors/planted_cross.py': 'import shop.modules.customers.domain.customer\n',
      'src/shop/modules/orders/infrastructure/gateways/planted_platform.py': 'from shop.platform.db.connection import connect\n',
      'src/shop/modules/orders/infrastructure/gateways/planted_infra.py':
        'from shop.modules.customers.infrastructure.gateways.in_memory import customer_in_memory_repository\n',
    },
  },
  {
    name: 'go-arch-lint',
    project: join(ROOT, 'examples/go'),
    command: () => ['go-arch-lint', ['check', '--output-color=false']],
    available: () => !spawnSync('go-arch-lint', ['version']).error,
    plant: {
      'internal/modules/orders/domain/planted_outward.go': 'package domain\n\nimport _ "example.com/shop/internal/modules/orders/application/interactors"\n',
      'internal/modules/orders/application/interactors/planted_cross.go': 'package interactors\n\nimport _ "example.com/shop/internal/modules/customers/domain"\n',
      'internal/modules/orders/infrastructure/gateways/planted_platform.go': 'package gateways\n\nimport _ "example.com/shop/internal/platform/db"\n',
      'internal/modules/orders/infrastructure/gateways/planted_infra.go':
        'package gateways\n\nimport _ "example.com/shop/internal/modules/customers/infrastructure/gateways/inmemory"\n',
    },
  },
];

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !detail ? '' : '\n         ' + detail}`);
  if (!ok) failures.push(name);
};
const run = (linter, cwd) => {
  const [cmd, args] = linter.command();
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...linter.env } });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
};

const temps = [];
try {
  for (const linter of LINTERS) {
    if (!linter.available()) {
      if (strict) check(`${linter.name}: installed`, false, 'not found (see the header of this script)');
      else console.log(`  skip  ${linter.name}: not installed`);
      continue;
    }
    const clean = run(linter, linter.project);
    check(`${linter.name}: passes on its clean project`, clean.status === 0, clean.output.slice(-600));

    const copy = mkdtempSync(join(tmpdir(), 'ca-linters-'));
    temps.push(copy);
    if (linter.copy) for (const p of linter.copy) cpSync(join(linter.project, p), join(copy, p), { recursive: true });
    else cpSync(linter.project, copy, { recursive: true });
    for (const p of linter.link ?? []) symlinkSync(join(linter.project, p), join(copy, p));
    for (const [rel, content] of Object.entries(linter.plant)) {
      mkdirSync(dirname(join(copy, rel)), { recursive: true });
      writeFileSync(join(copy, rel), content);
    }
    const planted = run(linter, copy);
    const names = Object.keys(linter.plant).map((rel) => rel.split('/').pop().replace(/\.\w+$/, ''));
    const missed = names.filter((n) => !planted.output.includes(n));
    check(`${linter.name}: fails on the planted violations and names each one (layers, modules, platform)`,
      planted.status !== 0 && missed.length === 0, `exit ${planted.status}; not reported: ${missed.join(', ') || '-'}\n${planted.output.slice(-600)}`);
  }
} finally {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
}
console.log(failures.length === 0 ? '\nAll linter checks passed.' : `\n${failures.length} linter check(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
