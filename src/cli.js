#!/usr/bin/env node
/**
 * ca-scan — the plugin's checks for CI and the terminal, without Claude Code or MCP.
 *
 *   ca-scan [path] [--json] [--strict]
 *
 * Runs the same analysis as the ca_scan and ca_cycles tools on `path` (default: the current directory):
 * the Dependency Rule, the Module Rule, SQL placement and table ownership, configuration and i18n placement, and
 * cycles between components.
 *
 * Exit codes:
 *   0  clean
 *   1  violations or cycles (or, with --strict, any warning)
 *   2  the result is not reliable: no file is in the layout (nothing was checked), code in a legacy
 *      layout, or code in a language without a profile
 *  64  bad usage
 */
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { projectCycles, scanProject } from './lib/scan.js';

const USAGE = 'Usage: ca-scan [path] [--json] [--strict]';
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('-')));
const paths = args.filter((a) => !a.startsWith('-'));

if (flags.has('-h') || flags.has('--help')) {
  console.log(`${USAGE}\n\nChecks layers, modules, SQL placement, table ownership, configuration and i18n placement, and cycles. Exit 0 clean, 1 violations,\n2 not reliable (no file in the layout, legacy layout or unsupported language), 64 bad usage.`);
  process.exit(0);
}
const unknown = [...flags].filter((f) => !['--json', '--strict'].includes(f));
if (unknown.length || paths.length > 1) {
  console.error(`${unknown.length ? `Unknown option ${unknown.join(', ')}. ` : 'Only one path. '}${USAGE}`);
  process.exit(64);
}
const root = resolve(paths[0] ?? '.');
if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`Not a directory: ${root}`);
  process.exit(64);
}

const scan = scanProject(root);
const cycles = projectCycles(root);
const strict = flags.has('--strict');
const code =
  scan.summary.healthScore === null ? 2 :
  scan.violations.length > 0 || cycles.cyclesFound > 0 || (strict && scan.warnings.length > 0) ? 1 : 0;

if (flags.has('--json')) {
  console.log(JSON.stringify({ ...scan, cycles: cycles.cycles, exitCode: code }, null, 2));
  process.exit(code);
}

const s = scan.summary;
const langs = Object.entries(s.languages).map(([l, n]) => `${l} ${n}`).join(', ') || 'none';
console.log(`Clean Architecture scan of ${root}`);
console.log(`  ${s.filesScanned} file(s) (${langs}); grade ${s.grade}`);
for (const w of scan.warnings) console.log(`\n  ⚠ ${w}`);
for (const v of scan.violations) {
  console.log(`\n  ✗ [${v.severity}] ${v.rule}  ${v.file}`);
  console.log(`    ${v.what} — ${v.message}`);
  console.log(`    Fix: ${v.fix}`);
}
for (const c of cycles.cycles) console.log(`\n  ✗ cycle ${c.cycle}\n    Fix: ${c.fix}`);
console.log(
  `\n${scan.violations.length} violation(s) (layers ${s.layerViolations}, modules ${s.crossModuleViolations}, SQL ${s.sqlViolations}, config ${s.configViolations}, i18n ${s.i18nViolations}), ` +
  `${cycles.cyclesFound} cycle(s), ${scan.warnings.length} warning(s).`
);
process.exit(code);
