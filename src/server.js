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
  detectLayer,
  detectModule,
  findViolations,
  srcDirForFile,
  toPosix,
} from './lib/architecture.js';
import { PROFILES, profileFor, unsupportedLanguageOf } from './lib/languages/index.js';
import { tableOwnership, walkSource } from './lib/project.js';
import { SCAFFOLD_LANGUAGES, planScaffold } from './lib/scaffold.js';
import { projectCycles, projectMetrics, scanProject, srcDirOf } from './lib/scan.js';

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

// ── Message dispatch ───────────────────────────────────────────────────────

function handleMessage(msg) {
  const { method, id, params } = msg;

  if (method === 'initialize') {
    ok(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'clean-architecture', version: '2.6.1' },
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
        case 'ca_scan':     result = scanProject(safePath(args.path));    break;
        case 'ca_metrics':  result = projectMetrics(safePath(args.path)); break;
        case 'ca_scaffold': result = toolScaffold(args); break;
        case 'ca_layer_of': result = toolLayerOf(args);  break;
        case 'ca_cycles':   result = projectCycles(safePath(args.path)); break;
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
