#!/usr/bin/env node
/**
 * Clean Architecture MCP Server
 * Zero external dependencies — uses only Node.js built-ins.
 * Implements the Model Context Protocol (JSON-RPC over stdio).
 */

import { createInterface } from 'readline';
import { readFileSync, existsSync, mkdirSync, writeFileSync, realpathSync } from 'fs';
import { join, relative, dirname, resolve, normalize, sep } from 'path';
import { fileURLToPath } from 'url';
import {
  ALLOWED_LAYERS,
  RESERVED_MODULE_NAMES,
  componentOf,
  detectLayer,
  detectModule,
  fileImports,
  findViolations,
  srcDirForFile,
  toPosix,
  usesLegacyLayerName,
} from './lib/architecture.js';
import { PROFILES, profileFor, unsupportedLanguageOf } from './lib/languages/index.js';
import { tableOwnership, walkSource } from './lib/project.js';
import { SCAFFOLD_LANGUAGES, planScaffold } from './lib/scaffold.js';

const SUPPORTED_NAMES = PROFILES.map((p) => p.name).join(', ');

const rl = createInterface({ input: process.stdin, terminal: false });

// ── MCP JSON-RPC transport ─────────────────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function ok(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function err(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    handleMessage(msg);
  } catch (e) {
    // Ignore parse errors
  }
});

// ── Tool definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'ca_scan',
    description:
      'Scan a project directory for Clean Architecture Dependency Rule violations. ' +
      'Reports every file that imports from a layer it should not depend on, with severity levels. ' +
      'Also checks SQL (.sql files and SQL in string literals): it may live only in infrastructure and ' +
      "platform/db, and a module may use only the tables its own migrations create. " +
      `Languages: ${SUPPORTED_NAMES}; files in any other language are reported as not checked.`,
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Root path of the project to scan (defaults to current working directory).',
        },
      },
    },
  },
  {
    name: 'ca_metrics',
    description:
      'Calculate component stability and abstractness metrics for a project. ' +
      'Reports Fan-in, Fan-out, Instability (I), Abstractness (A), and Distance from Main Sequence (D) ' +
      'for each component, identifying components in the Zone of Pain or Zone of Uselessness.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Root path of the project to analyse.',
        },
      },
    },
  },
  {
    name: 'ca_scaffold',
    description:
      'Create the lean Clean Architecture scaffold (feature-first) for a new project: ' +
      'src/modules/<module>/{domain,application,infrastructure} for each module, src/main/, docs/architecture/ARCHITECTURE.md ' +
      'and .gitkeep stubs. Everything else (shared/, platform/, ports/, interactors/, controllers/, gateways/, test trees) ' +
      'is created on demand by the skills that need it. The layout follows the language: Python uses ' +
      'src/<package>/modules/<module>/... with snake_case names, __init__.py packages and src/<package>/main/__main__.py; ' +
      'Go uses internal/modules/<module>/..., internal/bootstrap/ (composition root) and cmd/<app>/main.go, with no src/.',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: {
          type: 'string',
          description: 'Absolute path where the scaffold should be created.',
        },
        language: {
          type: 'string',
          enum: SCAFFOLD_LANGUAGES,
          description: 'Target programming language (determines the layout, names and stubs). Defaults to typescript.',
        },
        domain: {
          type: 'string',
          description:
            'Business domain name (e.g. "OrderManagement") — used in stub comments and as the default module name; ' +
            'in Python it is also the package under src/ (unless pyproject.toml names it), in Go the cmd/<app> folder.',
        },
        modules: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Module names to create under modules/ (e.g. ["orders", "customers"]), adapted to the language: ' +
            'kebab-case (TypeScript/JavaScript), snake_case (Python), one lowercase word (Go). ' +
            'Defaults to one module named after the domain, or "core". ' +
            'Reserved: shared, platform, main, domain, application, infrastructure, modules, bootstrap, composition, ' +
            'and app, infra, adapters (names of earlier layouts).',
        },
      },
      required: ['rootPath'],
    },
  },
  {
    name: 'ca_layer_of',
    description:
      'Determine which Clean Architecture layer a given file belongs to based on its path, ' +
      'and check whether its imports are compliant with the Dependency Rule.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute or relative path to the source file.',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'ca_cycles',
    description:
      'Detect cyclic dependencies between components (ADP — Acyclic Dependencies Principle). ' +
      'Returns every cycle found in the component dependency graph with suggested fixes.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Root path of the project to analyse.',
        },
      },
    },
  },
];

// ── Path safety ───────────────────────────────────────────────────────────

const SAFE_ROOT = realpathSync(resolve(process.cwd()));

/** Real path of `p`, following symlinks in the part that exists (the rest may not exist yet). */
function realPathOf(p) {
  let head = p;
  const tail = [];
  while (!existsSync(head)) {
    const parent = dirname(head);
    if (parent === head) break;
    tail.unshift(head.slice(parent.length).replace(/^[\\/]+/, ''));
    head = parent;
  }
  return join(existsSync(head) ? realpathSync(head) : head, ...tail);
}

function safePath(p) {
  if (!p || typeof p !== 'string') return SAFE_ROOT;
  // Compare real paths (macOS: /var → /private/var) and against "<root><sep>", so neither a
  // symlink nor a sibling such as "<root>-other" passes as inside the working directory.
  const resolved = realPathOf(resolve(normalize(p)));
  const rootWithSep = SAFE_ROOT.endsWith(sep) ? SAFE_ROOT : SAFE_ROOT + sep;
  if (resolved !== SAFE_ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error(`Path "${p}" is outside the working directory.`);
  }
  return resolved;
}

// ── File system helpers ────────────────────────────────────────────────────

const walkSrc = walkSource;

// ── Tool: ca_scan ──────────────────────────────────────────────────────────

function srcDirOf(root) {
  return existsSync(join(root, 'src')) ? join(root, 'src') : root;
}

// Top-level folders of the previous layer-first layout. Files there are no longer
// classified, so they must be reported instead of silently counting as "clean".
const LEGACY_TOP = /^(entities|usecases|use-cases|use_cases|adapters|frameworks|infrastructure)\//;

function toolScan(args) {
  const root = safePath(args.path);
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

// ── Tool: ca_metrics ──────────────────────────────────────────────────────
// Components are modules (modules/<name>) plus shared, platform and main.

function toolMetrics(args) {
  const root = safePath(args.path);
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

// ── Tool: ca_scaffold ─────────────────────────────────────────────────────
// The plan (folders, files, names per language) lives in ./lib/scaffold.js; this only writes it.

function toolScaffold(args) {
  const safeRoot = safePath(args.rootPath);
  const readFile = (rel) => {
    const full = join(safeRoot, rel);
    return existsSync(full) ? readFileSync(full, 'utf8') : null;
  };
  const plan = planScaffold(args, readFile);

  const created = [];
  for (const dir of plan.dirs) {
    const full = join(safeRoot, dir);
    if (!existsSync(full)) {
      mkdirSync(full, { recursive: true });
      created.push(dir + '/');
    }
  }
  for (const stub of plan.stubs) {
    const full = join(safeRoot, stub.path);
    if (!existsSync(full)) {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, stub.content);
      created.push(stub.path);
    }
  }

  const first = plan.modules[0];
  const entity = args.domain && !(Array.isArray(args.modules) && args.modules.length) ? plan.domain : '<Entity>';
  return {
    message: `Scaffold created for domain "${plan.domain}" (${plan.lang}) with module(s): ${plan.modules.join(', ')}`,
    modules: plan.modules,
    created,
    nextSteps: [
      ...plan.nextSteps,
      `Run /clean-architecture:entity ${first}/${entity} to create your first entity`,
      `Run /clean-architecture:usecase ${first}/Create${entity === '<Entity>' ? '<Entity>' : entity} to create your first use case`,
      `Run /clean-architecture:check to verify the dependency and module rules`,
    ],
  };
}

// ── Tool: ca_layer_of ─────────────────────────────────────────────────────

function toolLayerOf(args) {
  const safeFile = safePath(args.filePath);
  // The file's own src/ (a nested project such as examples/shop has its own), else the cwd's.
  const srcDir = srcDirForFile(safeFile) ?? srcDirOf(SAFE_ROOT);
  const rel = toPosix(relative(srcDir, safeFile));
  const layerDef = detectLayer(rel);

  if (!layerDef) {
    return {
      layer: 'unknown',
      message: `Could not determine layer for: ${safeFile}`,
      suggestion:
        'Move the file into one of: src/modules/<module>/{domain,application,infrastructure}/, ' +
        'src/shared/, src/platform/, or src/main/',
    };
  }

  const mod = detectModule(rel);
  const allowedLayers = ALLOWED_LAYERS[layerDef.layer] || [];
  const profile = profileFor(safeFile);
  if (!profile) {
    return {
      layer: layerDef.layer,
      module: mod,
      level: layerDef.level,
      language: unsupportedLanguageOf(safeFile),
      message: `This file's language is not supported yet, so its imports were not checked. Supported: ${SUPPORTED_NAMES}.`,
    };
  }

  let content;
  try { content = readFileSync(safeFile, 'utf8'); } catch {
    return { layer: layerDef.layer, module: mod, level: layerDef.level, importViolations: [] };
  }

  const tables = profile.embeddedSql?.(content).length ? tableOwnership(srcDir, walkSrc(srcDir)) : null;
  const violations = findViolations(safeFile, srcDir, content, { tables }).map((v) => ({
    what: v.what,
    import: v.import,
    importedLayer: v.importedLayer,
    importedModule: v.importedModule,
    rule: v.rule,
    message: v.message,
  }));

  return {
    layer: layerDef.layer,
    module: mod,
    level: layerDef.level,
    language: profile.id,
    dependencyRuleCompliant: violations.length === 0,
    importViolations: violations,
    allowedDependencies: allowedLayers.length ? allowedLayers : ['none — this is the innermost layer'],
    crossModuleRule: 'Only infrastructure may reach another module, and only via its application/ports/input.',
  };
}

// ── Tool: ca_cycles ───────────────────────────────────────────────────────
// Cycles are searched between components: modules, shared, platform, main.

function toolCycles(args) {
  const root = safePath(args.path);
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

// ── Message dispatch ───────────────────────────────────────────────────────

function handleMessage(msg) {
  const { method, id, params } = msg;

  if (method === 'initialize') {
    ok(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'clean-architecture', version: '2.4.0' },
    });
    return;
  }

  if (method === 'notifications/initialized') return; // no response

  if (method === 'tools/list') {
    ok(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    try {
      let result;
      switch (name) {
        case 'ca_scan':     result = toolScan(args);     break;
        case 'ca_metrics':  result = toolMetrics(args);  break;
        case 'ca_scaffold': result = toolScaffold(args); break;
        case 'ca_layer_of': result = toolLayerOf(args);  break;
        case 'ca_cycles':   result = toolCycles(args);   break;
        default:
          err(id, -32601, `Unknown tool: ${name}`);
          return;
      }
      ok(id, {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      });
    } catch (e) {
      ok(id, {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true,
      });
    }
    return;
  }

  if (id !== undefined) {
    err(id, -32601, 'Method not found');
  }
}

// Keep the process alive for stdio communication
process.stdin.resume();
