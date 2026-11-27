/**
 * Project-wide analyses: ca_scan, ca_metrics and ca_cycles. Shared by the MCP server (src/server.js),
 * which restricts `root` to its working directory, and the ca-scan CLI (src/cli.js), which runs in CI.
 */
import { existsSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { componentOf, detectLayer, fileImports, findViolations, toPosix, usesLegacyLayerName } from './architecture.js';
import { PROFILES, profileFor, unsupportedLanguageOf } from './languages/index.js';
import { tableOwnership, walkSource } from './project.js';

const walkSrc = walkSource;
export const SUPPORTED_NAMES = PROFILES.map((p) => p.name).join(', ');

// ── ca_scan ──────────────────────────────────────────────────────────

export function srcDirOf(root) {
  return existsSync(join(root, 'src')) ? join(root, 'src') : root;
}

// Top-level folders of the previous layer-first layout. Files there are no longer
// classified, so they must be reported instead of silently counting as "clean".
const LEGACY_TOP = /^(entities|usecases|use-cases|use_cases|adapters|frameworks|infrastructure)\//;

export function scanProject(root) {
  const srcDir = srcDirOf(root);
  const files = walkSrc(srcDir);
  const contents = new Map();
  const read = (f) => {
    if (!contents.has(f)) contents.set(f, readFileSync(f, 'utf8'));
    return contents.get(f);
  };
  const tables = tableOwnership(srcDir, files, read); // first pass: which module owns each table

  const violations = [];
  let unclassified = 0;  // outside any known layer and NOT in an old layer folder
  let legacy = 0;        // in an old layer-first folder (classified or not)
  let legacyNames = 0;   // in modules/<m>/app/ or modules/<m>/infra/ (classified, but renamed in 2.0)
  const languages = {};  // profile id → files checked
  const unsupported = {}; // language without a profile → files found (never checked)
  let unsupportedInLayers = 0;
  for (const file of files) {
    const rel = toPosix(relative(srcDir, file));
    const profile = profileFor(file);
    if (!profile) {
      const lang = unsupportedLanguageOf(file);
      unsupported[lang] = (unsupported[lang] || 0) + 1;
      if (detectLayer(rel)) unsupportedInLayers++;
      continue;
    }
    languages[profile.id] = (languages[profile.id] || 0) + 1;
    let content;
    try { content = read(file); } catch { continue; }
    if (LEGACY_TOP.test(rel)) legacy++;
    else if (!detectLayer(rel) && !profile.isNeutral?.(rel, content)) unclassified++;
    if (usesLegacyLayerName(rel)) legacyNames++;
    for (const v of findViolations(file, srcDir, content, { tables })) {
      violations.push({ file: relative(root, file), ...v });
    }
  }

  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  for (const v of violations) counts[v.severity]++;

  const byRule = (...rules) => violations.filter((v) => rules.includes(v.rule)).length;
  const score = Math.max(0, 100 - counts.CRITICAL * 20 - counts.HIGH * 10 - counts.MEDIUM * 5);

  const warnings = [];
  const unsupportedTotal = Object.values(unsupported).reduce((a, b) => a + b, 0);
  if (unsupportedTotal > 0) {
    const list = Object.entries(unsupported).map(([lang, n]) => `${lang}: ${n}`).join(', ');
    warnings.push(
      `${unsupportedTotal} file(s) are in languages the plugin cannot check yet (${list}). ` +
      `Their imports were NOT verified. Supported: ${SUPPORTED_NAMES}.`
    );
  }
  if (legacy > 0) {
    warnings.push(
      `${legacy} file(s) are in the previous layer-first layout (src/entities, src/usecases, src/adapters, ` +
      'src/frameworks). They are NOT covered by the layer/module rules, so the health score is not reliable. ' +
      'Run /clean-architecture:migrate to move them into src/modules/<module>/{domain,application,infrastructure}.'
    );
  }
  if (legacyNames > 0) {
    warnings.push(
      `${legacyNames} file(s) use the layer folder names of plugin versions before 2.0 (modules/<m>/app/, ` +
      'modules/<m>/infra/adapters/). The rules still apply to them; run /clean-architecture:migrate to rename ' +
      'app/ to application/ and infra/adapters/<x>/ to infrastructure/<x>/.'
    );
  }
  if (unclassified > 0) {
    warnings.push(
      `${unclassified} file(s) are outside any known layer ` +
      '(expected: src/modules/<module>/{domain,application,infrastructure}, src/shared, src/platform, src/main).'
    );
  }

  // A score computed while part of the architecture is not covered by the rules would be misleading.
  const notCovered =
    legacy > 0 ? 'N/A — legacy layout detected, run /clean-architecture:migrate' :
    unsupportedInLayers > 0 ? 'N/A — code in languages the plugin cannot check yet' : null;

  return {
    warnings,
    summary: {
      filesScanned: files.length,
      languages,
      unclassifiedFiles: unclassified,
      violations: violations.length,
      layerViolations: byRule('dependency-rule'),
      crossModuleViolations: byRule('cross-module'),
      sqlViolations: byRule('sql-placement', 'table-ownership'),
      tables: Object.fromEntries([...tables].map(([t, owners]) => [t, [...owners].sort().join(', ')])),
      critical: counts.CRITICAL,
      high: counts.HIGH,
      medium: counts.MEDIUM,
      healthScore: notCovered ? null : score,
      grade:
        notCovered ? notCovered :
        score >= 90 ? 'A — Excellent' :
        score >= 75 ? 'B — Good' :
        score >= 50 ? 'C — Fair' :
        score >= 25 ? 'D — Poor' : 'F — Critical',
    },
    violations,
  };
}

// ── ca_metrics ──────────────────────────────────────────────────────
// Components are modules (modules/<name>) plus shared, platform and main.

export function projectMetrics(root) {
  const srcDir = srcDirOf(root);
  const files = walkSrc(srcDir);

  // Build component → files map
  const components = {};
  for (const file of files) {
    if (profileFor(file)?.metrics === false) continue; // SQL: tables, not types or imports
    const comp = componentOf(toPosix(relative(srcDir, file)));
    if (!comp) continue;
    if (!components[comp]) components[comp] = { files: [], fanIn: 0, fanOut: 0, abstractClasses: 0 };
    components[comp].files.push(file);
  }

  // Count fan-in / fan-out and abstract classes
  for (const [comp, data] of Object.entries(components)) {
    let abstractCount = 0;
    for (const file of data.files) {
      let content;
      try { content = readFileSync(file, 'utf8'); } catch { continue; }

      // Interfaces / abstract types, as the file's language defines them
      if (profileFor(file)?.isAbstract(content)) abstractCount++;

      // Count outgoing dependencies to other components
      for (const { rel: impRel } of fileImports(file, srcDir, content)) {
        const impComp = impRel === null ? null : componentOf(impRel);
        if (impComp && impComp !== comp) {
          data.fanOut++;
          if (components[impComp]) components[impComp].fanIn++;
        }
      }
    }
    data.abstractClasses = abstractCount;
  }

  const metrics = [];
  for (const [comp, data] of Object.entries(components)) {
    const ca = data.fanIn;
    const ce = data.fanOut;
    const total = ca + ce;
    const instability = total === 0 ? 0 : ce / total;
    const nc = data.files.length;
    const na = data.abstractClasses;
    const abstractness = nc === 0 ? 0 : na / nc;
    const distance = Math.abs(abstractness + instability - 1);

    metrics.push({
      component: comp,
      files: nc,
      fanIn: ca,
      fanOut: ce,
      instability: instability.toFixed(2),
      abstractClasses: na,
      abstractness: abstractness.toFixed(2),
      distanceFromMainSequence: distance.toFixed(2),
      zone:
        distance > 0.7 && abstractness < 0.3 && instability < 0.3 ? 'ZONE OF PAIN ⚠' :
        distance > 0.7 && abstractness > 0.7 && instability > 0.7 ? 'ZONE OF USELESSNESS ⚠' :
        'Main Sequence ✓',
    });
  }

  return { metrics };
}

// ── ca_cycles ───────────────────────────────────────────────────────
// Cycles are searched between components: modules, shared, platform, main.

export function projectCycles(root) {
  const srcDir = srcDirOf(root);
  const files = walkSrc(srcDir);

  // Build adjacency map: component → Set<component>
  const graph = {};
  for (const file of files) {
    const comp = componentOf(toPosix(relative(srcDir, file)));
    if (!comp) continue;
    graph[comp] ??= new Set();
    let content;
    try { content = readFileSync(file, 'utf8'); } catch { continue; }
    for (const { rel: impRel } of fileImports(file, srcDir, content)) {
      const impComp = impRel === null ? null : componentOf(impRel);
      if (impComp && impComp !== comp) {
        graph[comp].add(impComp);
        graph[impComp] ??= new Set();
      }
    }
  }

  // DFS cycle detection
  const cycles = [];
  const visited = new Set();
  const stack = new Set();

  function dfs(node, path) {
    if (stack.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    for (const neighbor of (graph[node] || [])) {
      dfs(neighbor, [...path, node]);
    }
    stack.delete(node);
  }

  for (const node of Object.keys(graph)) dfs(node, []);

  const fixes = cycles.map((cycle) => ({
    cycle: cycle.join(' → '),
    fix: `Break the cycle by extracting a shared abstraction or introducing a port (DIP) at one of: ${cycle.slice(0, -1).join(' or ')}`,
  }));

  return {
    cyclesFound: cycles.length,
    adpCompliant: cycles.length === 0,
    cycles: fixes,
    message: cycles.length === 0
      ? 'No cycles detected. ADP (Acyclic Dependencies Principle) is satisfied.'
      : `${cycles.length} cycle(s) found. ADP is violated — see cycles array for details and fixes.`,
  };
}

