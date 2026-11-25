#!/usr/bin/env node
/**
 * Verifies the plugin engine against the reference example, in BOTH directions:
 *
 *   positive  examples/shop is compliant  -> the scanner must report nothing
 *   negative  planted violations          -> the scanner must report exactly those
 *
 * A scanner that reports nothing may simply be broken (we hit this twice while building the example:
 * a module detector that misread main/compose as a module, and an infra/ folder that escaped the rules),
 * so a clean result alone proves nothing. No dependencies are needed: it drives the repo's own MCP server.
 *
 *   node scripts/verify-example.mjs
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(ROOT, 'src/server.js');
const HOOK = join(ROOT, 'src/hooks/dependency-check.js');
const EXAMPLE = join(ROOT, 'examples/shop');

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !detail ? '' : '\n         ' + detail}`);
  if (!ok) failures.push(name);
};
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Calls one MCP tool with `cwd` as the project root (the server only reads inside its cwd). */
function callTool(cwd, name, args = {}) {
  const request = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } };
  const run = spawnSync(process.execPath, [SERVER], { cwd, input: JSON.stringify(request) + '\n', encoding: 'utf8' });
  const line = run.stdout.trim().split('\n').pop();
  const text = JSON.parse(line).result.content[0].text;
  try { return JSON.parse(text); } catch { return text; } // errors come back as plain text
}

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

  const cycles = callTool(EXAMPLE, 'ca_cycles');
  check('ca_cycles: no cycles between components', cycles.adpCompliant === true);

  // main/compose/*.ts must NOT be read as members of a module (a real regression we shipped once)
  const metrics = callTool(EXAMPLE, 'ca_metrics');
  const components = metrics.metrics.map((m) => m.component);
  check('ca_metrics: components are the modules plus platform and main',
    same(components, ['main', 'modules/customers', 'modules/orders', 'platform']), components.join(', '));

  const clean = runHook(join(EXAMPLE, 'src/modules/orders/infra/adapters/gateways/customer-lookup-gateway.ts'));
  check('hook: silent on the one legal cross-module import', clean.status === 0 && clean.stderr === '', clean.stderr);

  // ── 2. negative: planted violations must be found, exactly those ───────────────────────
  console.log('\n[2] planted violations are detected (and only those)');
  const bad = tmpProject('bad'); temps.push(bad);
  cpSync(join(EXAMPLE, 'src'), join(bad, 'src'), { recursive: true });
  const M = 'src/modules';
  write(bad, `${M}/orders/domain/planted-outward.ts`, "import { PlaceOrderInteractor } from '../app/interactors/place-order';\n");
  write(bad, `${M}/orders/app/interactors/planted-cross.ts`, "import { Customer } from '../../../customers/domain/customer';\n");
  write(bad, `${M}/orders/infra/adapters/gateways/planted-platform.ts`, "import { createDbConnection } from '../../../../../platform/db/connection';\n");
  write(bad, `${M}/orders/infra/adapters/gateways/planted-infra.ts`, "import { SqlCustomerRepository } from '../../../../customers/infra/adapters/gateways/sql-customer-repository';\n");
  // a file placed directly under infra/ (not infra/adapters/) must not escape the rules
  write(bad, `${M}/customers/infra/escapes.ts`, 'export const escapes = 1;\n');
  write(bad, `${M}/orders/infra/adapters/gateways/planted-escape.ts`, "import { escapes } from '../../../../customers/infra/escapes';\n");

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
  check('ca_scan: severity CRITICAL for domain -> app', found.violations.some((v) => v.file.endsWith('planted-outward.ts') && v.severity === 'CRITICAL'));
  check('ca_scan: the legal edge is still not reported', !got.some((g) => g.includes('customer-lookup-gateway')));
  check('ca_scan: grade drops below A', !found.summary.grade.startsWith('A'), found.summary.grade);

  const hook = runHook(join(bad, `${M}/orders/domain/planted-outward.ts`));
  check('hook: warns on a violating file and still exits 0', hook.status === 0 && hook.stderr.includes('ARCHITECTURE RULE VIOLATION'), hook.stderr || '(no output)');

  // A folder named modules/ that is NOT the business code must not create phantom modules. The example
  // renamed main/modules to main/compose, so it no longer exercises this: reproduce the original layout.
  const phantom = tmpProject('phantom'); temps.push(phantom);
  cpSync(join(EXAMPLE, 'src'), join(phantom, 'src'), { recursive: true });
  write(phantom, 'src/main/modules/orders.ts',
    "import { SqlOrderRepository } from '../../modules/orders/infra/adapters/gateways/sql-order-repository';\n" +
    "import { SqlCustomerRepository } from '../../modules/customers/infra/adapters/gateways/sql-customer-repository';\n");
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

  // ── 4. scaffold ─────────────────────────────────────────────────────────────────────────
  console.log('\n[4] ca_scaffold is lean and safe');
  const scaf = tmpProject('scaffold'); temps.push(scaf);
  const out = callTool(scaf, 'ca_scaffold', { rootPath: scaf, language: 'typescript', domain: 'Shop', modules: ['orders', 'customers'] });
  const dirs = out.created.filter((c) => c.endsWith('/')).sort();
  check('scaffold creates only domain/app/infra per module, main/ and docs/architecture/',
    same(dirs, ['docs/architecture/', 'src/main/', ...['orders', 'customers'].flatMap((m) => ['domain', 'app', 'infra'].map((l) => `src/modules/${m}/${l}/`))]), dirs.join(', '));
  check('scaffold writes the architecture doc outside src/', existsSync(join(scaf, 'docs/architecture/ARCHITECTURE.md')) && !existsSync(join(scaf, 'src/ARCHITECTURE.md')));
  check('scaffold creates no shared/ or platform/ until needed', !existsSync(join(scaf, 'src/shared')) && !existsSync(join(scaf, 'src/platform')));
  const rejected = callTool(scaf, 'ca_scaffold', { rootPath: scaf, modules: ['domain'] });
  check('scaffold rejects a reserved module name', typeof rejected === 'string' && /reserved/.test(rejected), String(rejected));
  const escaped = callTool(scaf, 'ca_scaffold', { rootPath: scaf, modules: ['../../etc'] });
  const outside = readdirSync(dirname(scaf)).includes('etc');
  check('scaffold sanitises path-traversal module names', !outside && (typeof escaped !== 'string' || !/etc\//.test(JSON.stringify(escaped.created))), JSON.stringify(escaped).slice(0, 160));
} finally {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
}

console.log(failures.length === 0 ? '\nAll checks passed.' : `\n${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}`);
process.exit(failures.length === 0 ? 0 : 1);
