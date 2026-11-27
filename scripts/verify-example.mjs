#!/usr/bin/env node
/**
 * Verifies the plugin engine against the reference example, in BOTH directions:
 *
 *   positive  examples/shop is compliant  -> the scanner must report nothing
 *   negative  planted violations          -> the scanner must report exactly those
 *
 * A scanner that reports nothing may simply be broken (we hit this twice while building the example:
 * a module detector that misread main/compose as a module, and a file under infra/ that escaped the rules),
 * so a clean result alone proves nothing. No dependencies are needed: it drives the repo's own MCP server.
 *
 *   node scripts/verify-example.mjs
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSnippets } from './check-snippets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src/server.js');
const HOOK = join(ROOT, 'src/hooks/dependency-check.js');
const SESSION_HOOK = join(ROOT, 'src/hooks/session-start.js');
const EXAMPLE = join(ROOT, 'examples/shop');
const FIXTURES = join(ROOT, 'fixtures');

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !detail ? '' : '\n         ' + detail}`);
  if (!ok) failures.push(name);
};
// A .gitkeep only exists to keep an EMPTY folder in git; next to other files it is leftover noise.
function strayGitkeeps(dir, found = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  if (entries.some((e) => e.name === '.gitkeep') && entries.length > 1) found.push(dir);
  for (const e of entries) if (e.isDirectory() && e.name !== 'node_modules') strayGitkeeps(join(dir, e.name), found);
  return found;
}
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Calls one MCP tool with `cwd` as the project root (the server only reads inside its cwd). */
function callTool(cwd, name, args = {}) {
  const request = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } };
  const run = spawnSync(process.execPath, [SERVER], { cwd, input: JSON.stringify(request) + '\n', encoding: 'utf8' });
  const line = run.stdout.trim().split('\n').pop();
  const text = JSON.parse(line).result.content[0].text;
  try { return JSON.parse(text); } catch { return text; } // errors come back as plain text
}

// What Claude Code actually sends to a PostToolUse hook: JSON on stdin, path in tool_input.file_path
const runHookStdin = (file, cwd) =>
  spawnSync(process.execPath, [HOOK], {
    env: { ...process.env, CLAUDE_TOOL_FILE: '', CLAUDE_PROJECT_DIR: '' },
    input: JSON.stringify({ cwd, hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: file } }),
    encoding: 'utf8',
  });

const runHook = (file) =>
  spawnSync(process.execPath, [HOOK], { env: { ...process.env, CLAUDE_TOOL_FILE: file }, encoding: 'utf8' });

const tmpProject = (label) => mkdtempSync(join(tmpdir(), `ca-verify-${label}-`));
const write = (root, rel, content) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
};

const temps = [];
try {
  // ── 1. positive: the example is compliant ───────────────────────────────────────────────
  console.log('\n[1] examples/shop is compliant');
  const scan = callTool(EXAMPLE, 'ca_scan');
  check('ca_scan: no violations', scan.summary.violations === 0, JSON.stringify(scan.violations));
  check('ca_scan: no warnings', scan.warnings.length === 0, scan.warnings.join(' | '));
  check('ca_scan: every file is classified', scan.summary.unclassifiedFiles === 0);
  check('ca_scan: health score 100', scan.summary.healthScore === 100);
  check('ca_scan: scanned a real project (not an empty directory)', scan.summary.filesScanned >= 30, `filesScanned=${scan.summary.filesScanned}`);

  const stray = strayGitkeeps(EXAMPLE);
  check('example: no .gitkeep left in a folder that has other files', stray.length === 0, stray.join(', '));

  const cycles = callTool(EXAMPLE, 'ca_cycles');
  check('ca_cycles: no cycles between components', cycles.adpCompliant === true);

  // main/compose/*.ts must NOT be read as members of a module (a real regression we shipped once)
  const metrics = callTool(EXAMPLE, 'ca_metrics');
  const components = metrics.metrics.map((m) => m.component);
  check('ca_metrics: components are the modules plus platform and main',
    same(components, ['main', 'modules/customers', 'modules/orders', 'platform']), components.join(', '));

  const clean = runHook(join(EXAMPLE, 'src/modules/orders/infrastructure/gateways/customer-lookup-gateway.ts'));
  check('hook: silent on the one legal cross-module import', clean.status === 0 && clean.stderr === '', clean.stderr);

  // ── 2. negative: planted violations must be found, exactly those ───────────────────────
  console.log('\n[2] planted violations are detected (and only those)');
  const bad = tmpProject('bad'); temps.push(bad);
  cpSync(join(EXAMPLE, 'src'), join(bad, 'src'), { recursive: true });
  const M = 'src/modules';
  write(bad, `${M}/orders/domain/planted-outward.ts`, "import { PlaceOrderInteractor } from '../application/interactors/place-order';\n");
  write(bad, `${M}/orders/application/interactors/planted-cross.ts`, "import { Customer } from '../../../customers/domain/customer';\n");
  write(bad, `${M}/orders/infrastructure/gateways/planted-platform.ts`, "import { createDbConnection } from '../../../../platform/db/connection';\n");
  write(bad, `${M}/orders/infrastructure/gateways/planted-infra.ts`, "import { SqlCustomerRepository } from '../../../customers/infrastructure/gateways/sql-customer-repository';\n");
  // a file placed directly under infrastructure/ (not in controllers/presenters/gateways) must not escape the rules
  write(bad, `${M}/customers/infrastructure/escapes.ts`, 'export const escapes = 1;\n');
  write(bad, `${M}/orders/infrastructure/gateways/planted-escape.ts`, "import { escapes } from '../../../customers/infrastructure/escapes';\n");

  const found = callTool(bad, 'ca_scan');
  const got = found.violations.map((v) => `${v.rule}:${v.file.split('/').pop()}`);
  const want = [
    'dependency-rule:planted-outward.ts',
    'cross-module:planted-cross.ts',
    'dependency-rule:planted-platform.ts',
    'cross-module:planted-infra.ts',
    'cross-module:planted-escape.ts',
  ];
  check('ca_scan: finds exactly the planted violations', same(got, want), `got:  ${got.sort().join(', ')}\n         want: ${want.sort().join(', ')}`);
  check('ca_scan: severity CRITICAL for domain -> application', found.violations.some((v) => v.file.endsWith('planted-outward.ts') && v.severity === 'CRITICAL'));
  check('ca_scan: the legal edge is still not reported', !got.some((g) => g.includes('customer-lookup-gateway')));
  check('ca_scan: grade drops below A', !found.summary.grade.startsWith('A'), found.summary.grade);

  const hook = runHook(join(bad, `${M}/orders/domain/planted-outward.ts`));
  check('hook: warns on a violating file and still exits 0', hook.status === 0 && hook.stderr.includes('ARCHITECTURE RULE VIOLATION'), hook.stderr || '(no output)');

  // A folder named modules/ that is NOT the business code must not create phantom modules. The example
  // renamed main/modules to main/compose, so it no longer exercises this: reproduce the original layout.
  const phantom = tmpProject('phantom'); temps.push(phantom);
  cpSync(join(EXAMPLE, 'src'), join(phantom, 'src'), { recursive: true });
  write(phantom, 'src/main/modules/orders.ts',
    "import { SqlOrderRepository } from '../../modules/orders/infrastructure/gateways/sql-order-repository';\n" +
    "import { SqlCustomerRepository } from '../../modules/customers/infrastructure/gateways/sql-customer-repository';\n");
  write(phantom, 'src/platform/modules/helper.ts', "import { Order } from '../../modules/orders/domain/order';\n");
  const ph = callTool(phantom, 'ca_scan');
  check('main/modules/ and platform/modules/ are not read as business modules (no false cross-module violations)',
    ph.summary.violations === 0, JSON.stringify(ph.violations.map((v) => `${v.rule}:${v.file}`)));
  const phComponents = callTool(phantom, 'ca_metrics').metrics.map((m) => m.component);
  check('ca_metrics: no phantom components such as "modules/orders.ts"',
    same(phComponents, ['main', 'modules/customers', 'modules/orders', 'platform']), phComponents.join(', '));

  // ── 3. a legacy layout must be flagged, not scored as "clean" ──────────────────────────
  console.log('\n[3] the previous layer-first layout is flagged instead of scoring 100');
  const legacy = tmpProject('legacy'); temps.push(legacy);
  write(legacy, 'src/entities/order.ts', 'export class Order {}\n');
  write(legacy, 'src/usecases/interactors/place-order.ts', "import { Order } from '../../entities/order';\n");
  const old = callTool(legacy, 'ca_scan');
  check('ca_scan: warns about the legacy layout', old.warnings.length === 1 && /previous layer-first layout/.test(old.warnings[0]), JSON.stringify(old.warnings));
  check('ca_scan: no health score for code the rules do not cover', old.summary.healthScore === null && old.summary.grade.startsWith('N/A'), old.summary.grade);

  // Projects created before 2.0 use modules/<m>/app/ and modules/<m>/infra/adapters/: still enforced, and flagged
  const pre2 = tmpProject('pre2'); temps.push(pre2);
  write(pre2, `${M}/orders/domain/order.ts`, 'export class Order {}\n');
  write(pre2, `${M}/orders/app/interactors/place-order.ts`, "import { Order } from '../../domain/order';\n");
  write(pre2, `${M}/orders/infra/adapters/gateways/legal.ts`, "import { G } from '../../../../customers/app/ports/input/get-customer';\n");
  write(pre2, `${M}/orders/infra/adapters/gateways/illegal.ts`, "import { C } from '../../../../customers/domain/customer';\n");
  write(pre2, `${M}/customers/domain/customer.ts`, 'export class Customer {}\n');
  write(pre2, `${M}/customers/app/ports/input/get-customer.ts`, 'export interface G {}\n');
  const p2 = callTool(pre2, 'ca_scan');
  const p2Got = p2.violations.map((v) => `${v.rule}:${v.file.split('/').pop()}`);
  check('pre-2.0 names app/ and infra/adapters/ are still enforced (legal edge allowed, illegal one reported)',
    same(p2Got, ['cross-module:illegal.ts']) && p2.summary.unclassifiedFiles === 0, p2Got.join(', '));
  check('pre-2.0 names are flagged with a rename warning', p2.warnings.some((w) => /before 2\.0/.test(w)), JSON.stringify(p2.warnings));

  // ── 4. scaffold ─────────────────────────────────────────────────────────────────────────
  console.log('\n[4] ca_scaffold is lean and safe');
  const scaf = tmpProject('scaffold'); temps.push(scaf);
  const out = callTool(scaf, 'ca_scaffold', { rootPath: scaf, language: 'typescript', domain: 'Shop', modules: ['orders', 'customers'] });
  const dirs = out.created.filter((c) => c.endsWith('/')).sort();
  check('scaffold creates only domain/application/infrastructure per module, main/ and docs/architecture/',
    same(dirs, ['docs/architecture/', 'src/main/', ...['orders', 'customers'].flatMap((m) => ['domain', 'application', 'infrastructure'].map((l) => `src/modules/${m}/${l}/`))]), dirs.join(', '));
  check('scaffold writes the architecture doc outside src/', existsSync(join(scaf, 'docs/architecture/ARCHITECTURE.md')) && !existsSync(join(scaf, 'src/ARCHITECTURE.md')));
  check('scaffold creates no shared/ or platform/ until needed', !existsSync(join(scaf, 'src/shared')) && !existsSync(join(scaf, 'src/platform')));
  const rejected = callTool(scaf, 'ca_scaffold', { rootPath: scaf, modules: ['domain'] });
  check('scaffold rejects a reserved module name', typeof rejected === 'string' && /reserved/.test(rejected), String(rejected));
  const escaped = callTool(scaf, 'ca_scaffold', { rootPath: scaf, modules: ['../../etc'] });
  const outside = readdirSync(dirname(scaf)).includes('etc');
  const sibling = callTool(scaf, 'ca_scaffold', { rootPath: `${scaf}-sibling`, modules: ['orders'] });
  check('scaffold rejects a sibling folder that only shares the root as a name prefix',
    typeof sibling === 'string' && /outside the working directory/.test(sibling) && !existsSync(`${scaf}-sibling`), String(sibling).slice(0, 160));
  check('scaffold sanitises path-traversal module names', !outside && (typeof escaped !== 'string' || !/etc\//.test(JSON.stringify(escaped.created))), JSON.stringify(escaped).slice(0, 160));

  // Go follows its own layout: no src/, modules under internal/modules/, wiring in internal/bootstrap/,
  // the entry point in cmd/<app>/, and module folders as one lowercase word.
  const goScaf = tmpProject('scaffold-go'); temps.push(goScaf);
  writeFileSync(join(goScaf, 'go.mod'), 'module example.com/shop\n\ngo 1.22\n');
  const goOut = callTool(goScaf, 'ca_scaffold', { rootPath: goScaf, language: 'go', domain: 'Shop', modules: ['orders', 'order-history'] });
  const goDirs = goOut.created.filter((c) => c.endsWith('/')).sort();
  check('scaffold (go): cmd/<app>/, internal/bootstrap/ and internal/modules/<m>/ with one-word module names, no src/',
    same(goDirs, ['cmd/shop/', 'docs/architecture/', 'internal/bootstrap/',
      ...['orders', 'orderhistory'].flatMap((m) => ['domain', 'application', 'infrastructure'].map((l) => `internal/modules/${m}/${l}/`))])
      && !existsSync(join(goScaf, 'src')), goDirs.join(', '));
  check('scaffold (go): cmd/<app>/main.go imports bootstrap through the go.mod module path',
    readFileSync(join(goScaf, 'cmd/shop/main.go'), 'utf8').includes('"example.com/shop/internal/bootstrap"'));
  const goScan = callTool(goScaf, 'ca_scan');
  check('scaffold (go): the result scans clean and every file is classified',
    goScan.violations.length === 0 && goScan.summary.unclassifiedFiles === 0, JSON.stringify(goScan.summary));
  const goBuild = spawnSync('go', ['vet', './...'], { cwd: goScaf, encoding: 'utf8' });
  if (goBuild.error) console.log('  skip  scaffold (go): go is not installed, the generated code was not compiled');
  else check('scaffold (go): the generated code passes go vet', goBuild.status === 0, goBuild.stderr);

  // Python: src/<package>/ (src layout), snake_case names, every folder a package, main/__main__.py.
  const pyScaf = tmpProject('scaffold-py'); temps.push(pyScaf);
  const pyOut = callTool(pyScaf, 'ca_scaffold', { rootPath: pyScaf, language: 'python', domain: 'OrderManagement', modules: ['orders', 'order-history'] });
  const pyDirs = pyOut.created.filter((c) => c.endsWith('/')).sort();
  const P = 'src/order_management';
  check('scaffold (python): src/<package>/modules/<m>/ with snake_case names and main/ in the package',
    same(pyDirs, [`${P}/main/`, 'docs/architecture/',
      ...['orders', 'order_history'].flatMap((m) => ['domain', 'application', 'infrastructure'].map((l) => `${P}/modules/${m}/${l}/`))]),
    pyDirs.join(', '));
  check('scaffold (python): every folder is a package (__init__.py instead of .gitkeep)',
    ['', '/modules', '/modules/orders', '/modules/orders/domain', '/modules/order_history/infrastructure', '/main']
      .every((d) => existsSync(join(pyScaf, `${P}${d}/__init__.py`))) && !pyOut.created.some((c) => c.endsWith('.gitkeep')),
    pyOut.created.join(', '));
  check('scaffold (python): without pyproject.toml, the next steps say how to make the package importable',
    pyOut.nextSteps.some((n) => /pyproject\.toml/.test(n)), JSON.stringify(pyOut.nextSteps));
  const pyScan = callTool(pyScaf, 'ca_scan');
  check('scaffold (python): the result scans clean and every file is classified',
    pyScan.violations.length === 0 && pyScan.warnings.length === 0 && pyScan.summary.unclassifiedFiles === 0, JSON.stringify(pyScan.summary));
  const pyRun = spawnSync('python3', ['-m', 'order_management.main'], { cwd: pyScaf, env: { ...process.env, PYTHONPATH: 'src' }, encoding: 'utf8' });
  if (pyRun.error) console.log('  skip  scaffold (python): python3 is not installed, the entry point was not run');
  else check('scaffold (python): python -m <package>.main runs', pyRun.status === 0, pyRun.stderr);
  const pyNamed = tmpProject('scaffold-py-named'); temps.push(pyNamed);
  writeFileSync(join(pyNamed, 'pyproject.toml'), '[project]\nname = "acme-shop"\nversion = "0.1.0"\n');
  const pyNamedOut = callTool(pyNamed, 'ca_scaffold', { rootPath: pyNamed, language: 'python', modules: ['orders'] });
  check('scaffold (python): the package is named after pyproject.toml when there is one',
    existsSync(join(pyNamed, 'src/acme_shop/main/__main__.py')) && !pyNamedOut.nextSteps.some((n) => /pyproject/.test(n)), pyNamedOut.created.join(', '));

  // TypeScript and JavaScript: the scaffold itself is clean, and JavaScript gets .js stubs.
  const tsScan = callTool(scaf, 'ca_scan');
  check('scaffold (typescript): the result scans clean and every file is classified',
    tsScan.violations.length === 0 && tsScan.warnings.length === 0 && tsScan.summary.unclassifiedFiles === 0, JSON.stringify(tsScan.summary));
  const jsScaf = tmpProject('scaffold-js'); temps.push(jsScaf);
  callTool(jsScaf, 'ca_scaffold', { rootPath: jsScaf, language: 'javascript', modules: ['orders'] });
  const jsMain = join(jsScaf, 'src/main/index.js');
  check('scaffold (javascript): src/main/index.js is valid JavaScript',
    existsSync(jsMain) && spawnSync(process.execPath, ['--check', jsMain]).status === 0);

  // Languages without a scaffold, and names that are not valid packages, are refused instead of guessed.
  const javaOut = callTool(scaf, 'ca_scaffold', { rootPath: scaf, language: 'java', modules: ['orders'] });
  check('scaffold rejects a language it has no layout for (no silent TypeScript fallback)',
    typeof javaOut === 'string' && /has no scaffold/.test(javaOut) && /python/.test(javaOut), String(javaOut));
  const digit = callTool(scaf, 'ca_scaffold', { rootPath: scaf, language: 'go', modules: ['3d-print'] });
  check('scaffold rejects a Go/Python module name that is not a valid package name', typeof digit === 'string' && /digit/.test(digit), String(digit));

  // ── 5. classification is positional and resolves every import form ─────────────────────
  console.log('\n[5] layers are classified by position, and barrel / package imports are resolved');
  const pos = tmpProject('positional'); temps.push(pos);
  // must be reported
  write(pos, `${M}/orders/domain/barrel-outward.ts`, "import { X } from '../application';\n");
  write(pos, `${M}/orders/application/barrel-cross.ts`, "import { C } from '../../customers/domain';\n");
  write(pos, `${M}/orders/application/alias-cross.ts`, "import { C } from '@/modules/customers';\n");
  write(pos, 'src/shop/modules/orders/application/py_cross.py', 'from shop.modules.customers.domain.customer import Customer\n');
  // must NOT be reported: main/<app>/ is main (even when named like a layer), and a nested shared/ folder
  // stays in its module's layer
  write(pos, 'src/main/application/index.ts', "import { createDbConnection } from '../../platform/db/connection';\n");
  write(pos, `${M}/orders/domain/shared/money.ts`, "import { Order } from '../order';\n");
  const ps = callTool(pos, 'ca_scan');
  const psGot = ps.violations.map((v) => `${v.rule}:${v.file.split('/').pop()}`);
  const psWant = [
    'dependency-rule:barrel-outward.ts',
    'cross-module:barrel-cross.ts',
    'cross-module:alias-cross.ts',
    'cross-module:py_cross.py',
  ];
  check('ca_scan: barrel, alias and Python package imports are checked; main/<app>/ and nested shared/ are not misread',
    same(psGot, psWant), `got:  ${psGot.sort().join(', ')}\n         want: ${psWant.sort().join(', ')}`);

  // ca_layer_of on a file of a NESTED project must use that project's src/, not the cwd's
  const nest = tmpProject('nested'); temps.push(nest);
  write(nest, 'src/index.ts', 'export {};\n'); // the cwd has its own src/, like this repo
  write(nest, `packages/shop/${M}/orders/application/cross.ts`, "import { C } from '../../customers/domain/customer';\n");
  const lo = callTool(nest, 'ca_layer_of', { filePath: `packages/shop/${M}/orders/application/cross.ts` });
  check('ca_layer_of: a nested project is classified against its own src/ (module found, violation reported)',
    lo.module === 'orders' && lo.dependencyRuleCompliant === false && lo.importViolations.some((v) => v.rule === 'cross-module'),
    JSON.stringify(lo).slice(0, 200));

  // ── 5b. every language profile, against its fixture ───────────────────────────────────
  // fixtures/<lang> is a small real project (it builds, runs or typechecks with its own toolchain).
  // It must scan clean; then the same four kinds of violation are planted with that language's
  // import syntax, plus imports that must NOT be reported (external packages named like a layer).
  console.log('\n[5b] each language profile: its fixture is clean, and planted violations are found exactly');
  const LANGS = {
    typescript: {
      modules: 'src/modules',
      plant: {
        'orders/domain/planted-outward.ts': "import { PlaceOrderInteractor } from '../application/interactors/place-order';\n",
        'orders/domain/planted-dynamic.tsx': "export const load = () => import('../infrastructure/gateways/customer-lookup-gateway');\n",
        'orders/application/interactors/planted-cross.mts': "import type { Customer } from '@/modules/customers/domain/customer';\n",
        'orders/infrastructure/gateways/planted-platform.cjs': "const { startServer } = require('../../../../platform/web/server.mjs');\n",
        'orders/infrastructure/gateways/planted-infra.jsx':
          "export { CustomerInMemoryRepository } from '../../../customers/infrastructure/gateways/in-memory/customer-in-memory-repository';\n",
        'orders/domain/planted-packages.ts': "import platform from 'platform';\nimport { z } from 'zod';\nimport { readFile } from 'node:fs';\n",
      },
      want: ['dependency-rule:planted-outward.ts', 'dependency-rule:planted-dynamic.tsx', 'cross-module:planted-cross.mts',
        'dependency-rule:planted-platform.cjs', 'cross-module:planted-infra.jsx'],
    },
    python: {
      modules: 'src/shop/modules',
      plant: {
        'orders/domain/planted_outward.py': 'def late():\n    from ..application.interactors.place_order import PlaceOrderInteractor\n    return PlaceOrderInteractor\n',
        'orders/application/interactors/planted_cross.py': 'import os, shop.modules.customers.domain.customer as customer\n',
        'orders/infrastructure/gateways/planted_platform.py': 'from shop.platform.db.connection import connect\n',
        'orders/infrastructure/gateways/planted_infra.py':
          'try:\n    from ....customers.infrastructure.gateways.in_memory import customer_in_memory_repository\nexcept ImportError:\n    pass\n',
        'orders/domain/planted_stdlib.py': 'import platform, json\nfrom typing import Protocol\n',
      },
      want: ['dependency-rule:planted_outward.py', 'cross-module:planted_cross.py', 'dependency-rule:planted_platform.py',
        'cross-module:planted_infra.py'],
    },
    go: {
      modules: 'internal/modules',
      plant: {
        'orders/domain/planted_outward.go':
          'package domain\n\nimport (\n\t"fmt"\n\n\tic "example.com/shop/internal/modules/orders/application/interactors"\n)\n',
        'orders/application/interactors/planted_cross.go': 'package interactors\n\nimport "example.com/shop/internal/modules/customers/domain"\n',
        'orders/infrastructure/gateways/planted_platform.go': 'package gateways\n\nimport _ "example.com/shop/internal/platform/clock"\n',
        'orders/infrastructure/gateways/planted_infra.go':
          'package gateways\n\nimport (\n\tmem "example.com/shop/internal/modules/customers/infrastructure/gateways/inmemory"\n)\n',
        'orders/domain/planted_external.go': 'package domain\n\nimport "github.com/other/lib/modules/customers/domain"\n',
      },
      want: ['dependency-rule:planted_outward.go', 'cross-module:planted_cross.go', 'dependency-rule:planted_platform.go',
        'cross-module:planted_infra.go'],
    },
    sql: {
      modules: 'src/modules',
      components: [], // SQL files are tables, not code: ca_metrics leaves them out
      minFiles: 6,
      plant: {
        'orders/domain/planted-placement.sql': 'SELECT id FROM orders;\n',
        'orders/infrastructure/gateways/queries/planted-cross.sql':
          'SELECT o.id, c.name FROM orders AS o JOIN customers AS c ON c.id = o.customer_id;\n',
        'orders/infrastructure/gateways/migrations/002_planted_fk.sql': 'ALTER TABLE orders ADD COLUMN buyer_id TEXT REFERENCES customers (id);\n',
        'customers/infrastructure/gateways/migrations/002_planted_duplicate.sql': 'CREATE TABLE order_lines (id TEXT PRIMARY KEY);\n',
        // SQL embedded in each language's string syntax
        'orders/infrastructure/gateways/planted_lookup.py': 'QUERY = """\n    SELECT name FROM customers WHERE id = ?\n"""\n',
        'orders/infrastructure/gateways/planted_lookup.go': 'package gateways\n\nconst rename = `UPDATE customers SET name = ? WHERE id = ?`\n',
        'orders/application/interactors/planted-query.ts': "export const open = `SELECT id FROM orders WHERE status = 'placed'`;\n",
        // must NOT be reported: its own tables, SQL in comments, and prose that starts like SQL
        'orders/infrastructure/gateways/planted-own.ts':
          "// SELECT * FROM customers  (a comment, not a query)\nexport const q = 'SELECT id FROM orders o JOIN order_lines l ON l.order_id = o.id';\n",
        'orders/domain/planted_prose.py': 'MESSAGE = "select a customer from the list"\nHINT = "Delete from cart failed"\n',
      },
      want: ['sql-placement:planted-placement.sql', 'table-ownership:planted-cross.sql', 'table-ownership:002_planted_fk.sql',
        'table-ownership:002_planted_duplicate.sql', 'table-ownership:001_create_orders.sql', 'table-ownership:planted_lookup.py',
        'table-ownership:planted_lookup.go', 'sql-placement:planted-query.ts'],
    },
  };
  check('every language profile has a fixture', same(readdirSync(FIXTURES), Object.keys(LANGS)), readdirSync(FIXTURES).join(', '));
  for (const [lang, spec] of Object.entries(LANGS)) {
    const fixture = join(FIXTURES, lang);
    const cleanScan = callTool(fixture, 'ca_scan');
    const wantComponents = spec.components ?? ['main', 'modules/customers', 'modules/orders', 'platform', 'shared'];
    check(`${lang}: fixture scans clean (no violations, no warnings, every file classified, only ${lang})`,
      cleanScan.summary.violations === 0 && cleanScan.warnings.length === 0 && cleanScan.summary.unclassifiedFiles === 0 &&
      same(Object.keys(cleanScan.summary.languages), [lang]) && cleanScan.summary.filesScanned >= (spec.minFiles ?? 10),
      JSON.stringify({ summary: cleanScan.summary, warnings: cleanScan.warnings, violations: cleanScan.violations }).slice(0, 400));
    const comps = callTool(fixture, 'ca_metrics').metrics;
    check(wantComponents.length ? `${lang}: components are ${wantComponents.join(', ')}, and the legal edge is counted` : `${lang}: no components (not code, left out of ca_metrics)`,
      same(comps.map((m) => m.component), wantComponents) &&
      (wantComponents.length === 0 ||
        (comps.find((m) => m.component === 'modules/customers').fanIn > 0 && comps.find((m) => m.component === 'shared').fanIn > 0)),
      comps.map((m) => `${m.component} in=${m.fanIn} out=${m.fanOut}`).join(' | '));
    check(`${lang}: no cycles`, callTool(fixture, 'ca_cycles').adpCompliant === true);

    const planted = tmpProject(`lang-${lang}`); temps.push(planted);
    cpSync(fixture, planted, { recursive: true });
    for (const [rel, content] of Object.entries(spec.plant)) write(planted, `${spec.modules}/${rel}`, content);
    const ls = callTool(planted, 'ca_scan');
    const lsGot = ls.violations.map((v) => `${v.rule}:${v.file.split('/').pop()}`);
    check(`${lang}: finds exactly the planted violations (external packages named like a layer are ignored)`, same(lsGot, spec.want),
      `got:  ${lsGot.sort().join(', ')}\n         want: ${[...spec.want].sort().join(', ')}`);
    const outwardFile = join(planted, spec.modules, Object.keys(spec.plant)[0]);
    const lh = runHookStdin(outwardFile, planted);
    check(`${lang}: the hook warns on the first planted violation`, lh.status === 0 && lh.stderr.includes('ARCHITECTURE RULE VIOLATION'),
      lh.stderr || '(no output)');
  }

  // Table ownership is inferred from the migrations, in .sql files and in code alike
  const owned = callTool(join(FIXTURES, 'sql'), 'ca_scan').summary.tables;
  check('sql: each table is owned by the module whose migrations create it (platform owns its bookkeeping)',
    same(Object.entries(owned).map(([t, o]) => `${t}=${o}`),
      ['schema_migrations=platform', 'customers=customers', 'orders=orders', 'order_lines=orders']),
    JSON.stringify(owned));
  const shopTables = callTool(EXAMPLE, 'ca_scan').summary.tables;
  check('examples/shop: tables created in TS code (platform) and in .sql migrations (modules) are both found',
    shopTables.schema_migrations === 'platform' && shopTables.customers === 'customers' && shopTables.orders === 'orders', JSON.stringify(shopTables));

  // A language without a profile is reported and never scores 100: its imports were not checked.
  const other = tmpProject('unsupported'); temps.push(other);
  cpSync(join(FIXTURES, 'typescript'), other, { recursive: true });
  write(other, 'src/modules/orders/domain/Legacy.java', 'import com.acme.modules.customers.domain.Customer;\nclass Legacy {}\n');
  write(other, 'src/modules/orders/domain/Pricing.cs', 'using Acme.Modules.Customers.Domain;\nclass Pricing {}\n');
  const os = callTool(other, 'ca_scan');
  check('unsupported languages (Java, C#) are reported as not checked, and the project gets no health score',
    os.warnings.some((w) => /not verified/i.test(w) && /Java: 1/.test(w) && /C#: 1/.test(w)) &&
    os.summary.healthScore === null && os.summary.grade.startsWith('N/A'), JSON.stringify({ w: os.warnings, s: os.summary }).slice(0, 300));
  const lj = callTool(other, 'ca_layer_of', { filePath: join(other, 'src/modules/orders/domain/Legacy.java') });
  check('ca_layer_of: a file without a profile says it was not checked', lj.language === 'Java' && /not supported/.test(lj.message), JSON.stringify(lj));

  // ── 6. the hook, driven the way Claude Code drives it ───────────────────────────────────
  console.log('\n[6] the PostToolUse hook reads Claude Code\'s stdin JSON and covers projects without src/');
  const hk = tmpProject('hook'); temps.push(hk);
  const outward = write(hk, `${M}/orders/domain/outward.ts`, "import { X } from '../application/interactors/x';\n");
  const viaStdin = runHookStdin(outward, hk);
  check('hook: warns when the path comes in tool_input.file_path on stdin',
    viaStdin.status === 0 && viaStdin.stderr.includes('ARCHITECTURE RULE VIOLATION'), viaStdin.stderr || '(no output)');
  const noSrc = tmpProject('nosrc'); temps.push(noSrc);
  const pyOutward = write(noSrc, 'app/modules/orders/domain/outward.py', 'from ..infrastructure.repo import Repo\n');
  const pyClean = write(noSrc, 'app/modules/orders/domain/clean.py', 'x = 1\n');
  const r1 = runHookStdin(pyOutward, noSrc);
  const r2 = runHookStdin(pyClean, noSrc);
  check('hook: a project without src/ (rooted at app/) is checked against the project root',
    r1.stderr.includes('ARCHITECTURE RULE VIOLATION') && r2.status === 0 && r2.stderr === '', `${r1.stderr || '(no output)'} | ${r2.stderr}`);

  // ── 7. the SessionStart hook only speaks in projects that use the layout ─────────────────
  console.log('\n[7] the SessionStart hook points to the rules skill only in projects with modules/');
  const runSessionStart = (cwd) =>
    spawnSync(process.execPath, [SESSION_HOOK], {
      env: { ...process.env, CLAUDE_PROJECT_DIR: '' },
      input: JSON.stringify({ cwd, hook_event_name: 'SessionStart', source: 'startup' }),
      encoding: 'utf8',
    });
  const ss = runSessionStart(EXAMPLE);
  let ctx = '';
  try { ctx = JSON.parse(ss.stdout).hookSpecificOutput.additionalContext; } catch { /* checked below */ }
  check('session-start: a project with src/modules/ gets the pointer to clean-architecture:rules',
    ss.status === 0 && ctx.includes('clean-architecture:rules'), ss.stdout || ss.stderr || '(no output)');
  const plain = tmpProject('plain'); temps.push(plain);
  write(plain, 'src/index.ts', 'export {};\n');
  const ssPlain = runSessionStart(plain);
  check('session-start: any other project gets no context at all', ssPlain.status === 0 && ssPlain.stdout === '', ssPlain.stdout);

  // ── 8. every skill can be discovered by Claude ──────────────────────────────────────────
  console.log('\n[8] every skill has frontmatter with its name and a description');
  const SKILLS = join(ROOT, 'skills');
  for (const name of readdirSync(SKILLS).sort()) {
    const md = readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8');
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(md)?.[1] ?? '';
    check(`skills/${name}: frontmatter with name "${name}" and a description`,
      new RegExp(`^name: ${name}$`, 'm').test(fm) && /^description: "This skill should be used .{40,}"$/m.test(fm),
      fm ? fm.split('\n')[0] : '(no frontmatter)');
  }

  // ── 9. skills are language-neutral; code lives in per-language references that parse ─────
  console.log('\n[9] SKILL.md files carry no code; references cover every language and parse');
  const CODE_LANGS = /^```(typescript|ts|tsx|javascript|js|python|py|go|golang|java|kotlin|csharp|cs|rust|ruby|php|sql)\s*$/m;
  const REF_LANGS = ['typescript', 'python', 'go'];
  for (const name of readdirSync(SKILLS).sort()) {
    const md = readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8');
    check(`skills/${name}: no code block in SKILL.md`, !CODE_LANGS.test(md), CODE_LANGS.exec(md)?.[0]);
    const refs = join(SKILLS, name, 'references');
    if (!existsSync(refs)) continue;
    const missing = REF_LANGS.filter((l) => !existsSync(join(refs, `${l}.md`)) || !md.includes(`references/${l}.md`));
    check(`skills/${name}: references for ${REF_LANGS.join(', ')} exist and SKILL.md links them`, missing.length === 0, missing.join(', '));
  }
  const snippets = checkSnippets();
  check(`every code block in the references parses (${snippets.checked} checked)`, snippets.failures.length === 0, snippets.failures.join('\n         '));
  if (snippets.skipped.length) console.log(`  skip  no parser for ${snippets.skipped.join(', ')} here (CI runs scripts/check-snippets.mjs --strict)`);
} finally {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
}

console.log(failures.length === 0 ? '\nAll checks passed.' : `\n${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}`);
process.exit(failures.length === 0 ? 0 : 1);
