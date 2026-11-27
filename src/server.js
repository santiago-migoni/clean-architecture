#!/usr/bin/env node
/**
 * Clean Architecture MCP Server
 * Zero external dependencies — uses only Node.js built-ins.
 * Implements the Model Context Protocol (JSON-RPC over stdio).
 */

import { createInterface } from 'readline';
import { readFileSync, existsSync, readdirSync, statSync, lstatSync, mkdirSync, writeFileSync, realpathSync } from 'fs';
import { join, relative, extname, dirname, resolve, normalize, sep } from 'path';
import { fileURLToPath } from 'url';
import {
  ALLOWED_LAYERS,
  RESERVED_MODULE_NAMES,
  componentOf,
  detectLayer,
  detectModule,
  extractImports,
  findViolations,
  importToSrcRelative,
  srcDirForFile,
  toPosix,
} from './lib/architecture.js';

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
      'Reports every file that imports from a layer it should not depend on, with severity levels.',
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
      'src/modules/<module>/{domain,app,infra} for each module, src/main/, docs/architecture/ARCHITECTURE.md ' +
      'and .gitkeep stubs. Everything else (shared/, platform/, ports/, interactors/, in-memory/, test trees) ' +
      'is created on demand by the skills that need it.',
    inputSchema: {
      type: 'object',
      properties: {
        rootPath: {
          type: 'string',
          description: 'Absolute path where the scaffold should be created.',
        },
        language: {
          type: 'string',
          enum: ['typescript', 'javascript', 'python', 'java', 'go', 'csharp'],
          description: 'Target programming language (determines file extensions and stubs).',
        },
        domain: {
          type: 'string',
          description: 'Business domain name (e.g. "OrderManagement") — used in stub comments and as the default module name.',
        },
        modules: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Module names to create under src/modules/ (e.g. ["orders", "customers"]). ' +
            'Defaults to one module named after the domain, or "core". ' +
            'Reserved: shared, platform, main, app, domain, infra, modules, adapters, bootstrap, composition.',
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

function walkSrc(dir, exts = ['.ts', '.js', '.py', '.java', '.go', '.cs', '.kt']) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || entry === 'node_modules' || entry === '__pycache__') continue;
    const full = join(dir, entry);
    const lstat = lstatSync(full);
    if (lstat.isSymbolicLink()) continue; // never follow symlinks
    if (lstat.isDirectory()) {
      files.push(...walkSrc(full, exts));
    } else if (exts.includes(extname(full))) {
      files.push(full);
    }
  }
  return files;
}

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

  const violations = [];
  let unclassified = 0; // outside any known layer and NOT in an old layer folder
  let legacy = 0;       // in an old layer-first folder (classified or not)
  for (const file of files) {
    const rel = toPosix(relative(srcDir, file));
    if (LEGACY_TOP.test(rel)) legacy++;
    else if (!detectLayer(rel)) unclassified++;
    let content;
    try { content = readFileSync(file, 'utf8'); } catch { continue; }
    for (const v of findViolations(file, srcDir, content)) {
      violations.push({ file: relative(root, file), ...v });
    }
  }

  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0 };
  for (const v of violations) counts[v.severity]++;

  const crossModule = violations.filter((v) => v.rule === 'cross-module').length;
  const score = Math.max(0, 100 - counts.CRITICAL * 20 - counts.HIGH * 10 - counts.MEDIUM * 5);

  const warnings = [];
  if (legacy > 0) {
    warnings.push(
      `${legacy} file(s) are in the previous layer-first layout (src/entities, src/usecases, src/adapters, ` +
      'src/frameworks). They are NOT covered by the layer/module rules, so the health score is not reliable. ' +
      'Run /clean-architecture:migrate to move them into src/modules/<module>/{domain,app,infra}.'
    );
  }
  if (unclassified > 0) {
    warnings.push(
      `${unclassified} file(s) are outside any known layer ` +
      '(expected: src/modules/<module>/{domain,app,infra/adapters}, src/shared, src/platform, src/main).'
    );
  }

  return {
    warnings,
    summary: {
      filesScanned: files.length,
      unclassifiedFiles: unclassified,
      violations: violations.length,
      layerViolations: violations.length - crossModule,
      crossModuleViolations: crossModule,
      critical: counts.CRITICAL,
      high: counts.HIGH,
      medium: counts.MEDIUM,
      // A score computed while part of the code is not covered by the rules would be misleading.
      healthScore: legacy > 0 ? null : score,
      grade:
        legacy > 0 ? 'N/A — legacy layout detected, run /clean-architecture:migrate' :
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

      // Detect abstract classes/interfaces
      if (/(?:interface\s+\w|abstract\s+class\s+\w|class\s+\w[^{]*implements|ABC\)|@abstractmethod)/.test(content)) {
        abstractCount++;
      }

      // Count outgoing dependencies to other components
      for (const imp of extractImports(content)) {
        const impComp = componentOf(importToSrcRelative(file, imp, srcDir));
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

const EXT_MAP = {
  typescript: 'ts', javascript: 'js', python: 'py',
  java: 'java', go: 'go', csharp: 'cs',
};

const VALID_LANGUAGES = new Set(['typescript', 'javascript', 'python', 'java', 'go', 'csharp']);

/** "OrderManagement" → "order-management". Output is [a-z0-9-] only (path-safe). */
function toKebab(s) {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function toolScaffold(args) {
  const safeRoot = safePath(args.rootPath);
  const lang = VALID_LANGUAGES.has(args.language) ? args.language : 'typescript';
  const domain = (args.domain || 'Domain').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'Domain';
  const ext = EXT_MAP[lang] || 'ts';

  // Modules: explicit list, else one module named after the domain, else "core".
  const requested = Array.isArray(args.modules) && args.modules.length
    ? args.modules
    : [args.domain ? domain : 'core'];
  const modules = [...new Set(requested.map(toKebab).filter(Boolean))].slice(0, 20);
  if (modules.length === 0) modules.push('core');
  for (const m of modules) {
    if (RESERVED_MODULE_NAMES.has(m)) {
      throw new Error(`Module name "${m}" is reserved (it would be ambiguous with a layer folder).`);
    }
  }

  // Lean scaffold: only what every project needs. Everything else (shared/, platform/,
  // ports/, interactors/, in-memory/, test trees, ...) is created on demand by the
  // skill that first needs it — empty folders are noise.
  const dirs = ['src/main', 'docs/architecture'];
  for (const m of modules) {
    const base = `src/modules/${m}`;
    dirs.push(`${base}/domain`, `${base}/app`, `${base}/infra`);
  }

  const created = [];
  for (const dir of dirs) {
    const full = join(safeRoot, dir);
    if (!existsSync(full)) {
      mkdirSync(full, { recursive: true });
      created.push(dir + '/');
    }
  }

  // Stub files (.gitkeep keeps otherwise-empty folders in git)
  const stubs = [
    {
      path: `src/main/index.${ext}`,
      content: `// MAIN COMPONENT — Composition Root\n// This is the ONLY file allowed to import concrete implementations from all modules and layers.\n// Wire all dependencies here. Nothing imports from main/.\n// With several entry points (api, worker, cli) use src/main/<app>/index.${ext} and share the modules.\n`,
    },
    {
      path: `docs/architecture/ARCHITECTURE.md`,
      content:
        `# ${domain} — Architecture\n\n` +
        `## Layout\n\n` +
        `\`\`\`\nsrc/\n├── modules/<module>/{domain, app, infra}   # business code, one folder per module\n├── shared/                                 # shared kernel — create only when needed\n├── platform/                               # web, db, external — create only when needed\n└── main/                                   # composition root (main/<app>/ if several entry points)\ntests/\n├── <module>/{unit, integration}/\n└── e2e/\ndocs/architecture/                          # this file, diagrams, ADRs\n\`\`\`\n\n` +
        `Subfolders (\`app/ports/{input,output}\`, \`app/interactors\`, \`infra/adapters/{controllers,presenters,gateways}\`, ` +
        `\`domain/{events,errors,services}\`) are created by the first file that needs them.\n\n` +
        `## Layers (inside each module)\n\n` +
        `| Layer | Path | May import |\n|---|---|---|\n` +
        `| domain | \`modules/<m>/domain/\` | shared |\n` +
        `| app | \`modules/<m>/app/\` | domain, shared |\n` +
        `| infra | \`modules/<m>/infra/adapters/\` | app, domain, shared |\n` +
        `| platform | \`platform/\` | everything inward |\n` +
        `| main | \`main/\` | everything — imported by no one |\n\n` +
        `## Dependency Rule\n\nSource code dependencies point **inward only**: infra → app → domain.\n\n` +
        `## Module Rule\n\nA module never imports another module's \`domain/\` or \`infra/\`.\n` +
        `The only legal crossing is \`A/infra/adapters\` → \`B/app/ports/input\`, through a port owned by A.\n\n` +
        `## Optional pieces\n\n` +
        `- **Input Port** — required when another module (or a second entry point) calls the use case; otherwise the controller may depend on the interactor directly.\n` +
        `- **Output Port + Presenter** — use when output formatting is non-trivial or several delivery mechanisms exist; otherwise the interactor returns a response model.\n` +
        `- **Migrations** live with their module (\`infra/adapters/gateways/migrations/\`); the connection and runner live in \`platform/db/\`.\n`,
    },
  ];
  for (const m of modules) {
    stubs.push(
      {
        path: `src/modules/${m}/domain/.gitkeep`,
        content: `# Module "${m}" — domain: enterprise business rules.\n# May import only from src/shared/.\n`,
      },
      {
        path: `src/modules/${m}/app/.gitkeep`,
        content: `# Module "${m}" — app: use cases (interactors) and the ports they need.\n# May import domain and src/shared only.\n`,
      },
      {
        path: `src/modules/${m}/infra/.gitkeep`,
        content: `# Module "${m}" — infra: adapters (infra/adapters/{controllers,presenters,gateways}).\n# Never imports platform/; framework clients are injected from main/.\n`,
      },
    );
  }

  for (const stub of stubs) {
    const full = join(safeRoot, stub.path);
    if (!existsSync(full)) {
      writeFileSync(full, stub.content);
      created.push(stub.path);
    }
  }

  const first = modules[0];
  const entity = args.domain && !(Array.isArray(args.modules) && args.modules.length) ? domain : '<Entity>';
  return {
    message: `Scaffold created for domain "${domain}" (${lang}) with module(s): ${modules.join(', ')}`,
    modules,
    created,
    nextSteps: [
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
        'Move the file into one of: src/modules/<module>/{domain,app,infra/adapters}/, ' +
        'src/shared/, src/platform/, or src/main/',
    };
  }

  const mod = detectModule(rel);
  const allowedLayers = ALLOWED_LAYERS[layerDef.layer] || [];

  let content;
  try { content = readFileSync(safeFile, 'utf8'); } catch {
    return { layer: layerDef.layer, module: mod, level: layerDef.level, importViolations: [] };
  }

  const violations = findViolations(safeFile, srcDir, content).map((v) => ({
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
    dependencyRuleCompliant: violations.length === 0,
    importViolations: violations,
    allowedDependencies: allowedLayers.length ? allowedLayers : ['none — this is the innermost layer'],
    crossModuleRule: 'Only adapters may reach another module, and only via its app/ports/input.',
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
    for (const imp of extractImports(content)) {
      const impComp = componentOf(importToSrcRelative(file, imp, srcDir));
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
      serverInfo: { name: 'clean-architecture', version: '1.0.2' },
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
