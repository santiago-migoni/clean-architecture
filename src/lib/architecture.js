/**
 * Shared architecture rules — the single source of truth used by both the MCP
 * server (src/server.js) and the PostToolUse hook (src/hooks/dependency-check.js).
 *
 * Layout (feature-first, domain / app / infra):
 *
 *   src/
 *   ├── modules/<module>/
 *   │   ├── domain/            Enterprise business rules
 *   │   ├── app/               Use cases: ports/{input,output} + interactors
 *   │   └── infra/adapters/    controllers, presenters, gateways
 *   ├── shared/                Shared kernel (pure, minimal)
 *   ├── platform/              Frameworks & drivers: web, db, external
 *   └── main/                  Composition root
 *
 * Two axes of rules:
 *   1. Layers  — dependencies point inward: infra → app → domain.
 *   2. Modules — a module never reaches into another module. The ONLY legal
 *      crossing is  A/infra/adapters  →  B/app/ports/input.
 *
 * Detection always runs on a path RELATIVE to src/, never on the absolute path,
 * so a project that happens to live under /app/ is not misclassified.
 */

import { dirname, resolve, relative } from 'path';

// ── Layers ─────────────────────────────────────────────────────────────────

export const LAYER_PATTERNS = [
  { layer: 'shared',   patterns: [/\/shared\//], level: 0 },
  { layer: 'domain',   patterns: [/\/domain\//], level: 1 },
  { layer: 'app',      patterns: [/\/app\//], level: 2 },
  {
    layer: 'adapters',
    // The whole infra/ folder is the adapters layer (not only infra/adapters/): a file placed
    // directly under infra/ must not escape the rules.
    patterns: [/\/infra\//, /\/controllers\//, /\/presenters\//, /\/gateways\//],
    level: 3,
  },
  { layer: 'platform', patterns: [/\/platform\//], level: 4 },
  { layer: 'main',     patterns: [/\/main\//, /\/bootstrap\//, /\/composition\//], level: 5 },
];

export const ALLOWED_LAYERS = {
  shared:   [],
  domain:   ['shared'],
  app:      ['domain', 'shared'],
  adapters: ['app', 'domain', 'shared'],
  platform: ['adapters', 'app', 'domain', 'shared'],
  main:     ['platform', 'adapters', 'app', 'domain', 'shared'],
};

/** Folder names that would be ambiguous as a module name. */
export const RESERVED_MODULE_NAMES = new Set([
  'shared', 'platform', 'main', 'app', 'domain', 'infra', 'modules', 'adapters', 'bootstrap', 'composition',
]);

// ── Path helpers ───────────────────────────────────────────────────────────

export function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function norm(p) {
  return '/' + toPosix(p).replace(/^\.?\//, '');
}

export function detectLayer(relPath) {
  const p = norm(relPath);
  return LAYER_PATTERNS.find((def) => def.patterns.some((re) => re.test(p))) || null;
}

export function detectModule(relPath) {
  const m = /\/modules\/([^/]+)(?:\/|$)/.exec(norm(relPath));
  return m ? m[1] : null;
}

/**
 * Component = the unit of cohesion/coupling analysis.
 * Every module is its own component; shared / platform / main are components too.
 */
export function componentOf(relPath) {
  const layerDef = detectLayer(relPath);
  if (!layerDef) return null;
  const mod = detectModule(relPath);
  return mod ? `modules/${mod}` : layerDef.layer;
}

// ── Import extraction ──────────────────────────────────────────────────────

const IMPORT_REGEXES = [
  // JS/TS: import ... from '...'
  /(?:import|export)\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g,
  // JS/TS: require('...')
  /require\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Python: from ... import / import ...
  /^(?:from\s+([\w./]+)\s+import|import\s+([\w./]+))/gm,
  // Java/Kotlin: import ...;
  /^import\s+([\w.]+);/gm,
  // Go: import "..."
  /import\s+"([^"]+)"/g,
];

export function extractImports(content) {
  const imports = [];
  for (const regex of IMPORT_REGEXES) {
    let m;
    const re = new RegExp(regex.source, regex.flags);
    while ((m = re.exec(content)) !== null) {
      const imp = m[1] || m[2];
      if (imp) imports.push(imp);
    }
  }
  return [...new Set(imports)];
}

/**
 * Turn an import specifier into a path relative to srcDir so that it can be
 * classified (layer + module) exactly like a file path.
 */
export function importToSrcRelative(file, imp, srcDir) {
  // Python relative imports: ".", "..", "...pkg.mod"
  const py = /^(\.+)([\w.]*)$/.exec(imp);
  if (py) {
    const [, dots, rest] = py;
    let base = dirname(file);
    for (let i = 1; i < dots.length; i++) base = dirname(base);
    return toPosix(relative(srcDir, resolve(base, rest.replace(/\./g, '/'))));
  }
  // JS/TS relative paths
  if (imp.startsWith('.')) {
    return toPosix(relative(srcDir, resolve(dirname(file), imp)));
  }
  // Dotted module paths (Python absolute / Java / Kotlin)
  if (!imp.includes('/') && imp.includes('.')) {
    return imp.replace(/\./g, '/');
  }
  // Aliases ('@/modules/orders/domain/order') and packages are classified as written.
  return imp;
}

// ── Rules ──────────────────────────────────────────────────────────────────

/**
 * The only legal way for one module to reach another:
 *   adapters of module A  →  app/ports/input of module B
 */
export function isLegalCrossModuleImport(fromLayer, toLayer, importedRelPath) {
  return (
    fromLayer === 'adapters' &&
    toLayer === 'app' &&
    /\/app\/ports\/input(\/|$)/.test(norm(importedRelPath))
  );
}

function severityFor(layer) {
  if (layer === 'shared' || layer === 'domain') return 'CRITICAL';
  if (layer === 'app') return 'HIGH';
  return 'MEDIUM';
}

/**
 * Check one file's imports against both axes (layers and modules).
 * Returns [] for files that do not belong to a known layer.
 */
export function findViolations(file, srcDir, content) {
  const rel = toPosix(relative(srcDir, file));
  const layerDef = detectLayer(rel);
  if (!layerDef) return [];

  const mod = detectModule(rel);
  const allowedLayers = ALLOWED_LAYERS[layerDef.layer] || [];
  const out = [];

  for (const imp of extractImports(content)) {
    const impRel = importToSrcRelative(file, imp, srcDir);
    const importedLayer = detectLayer(impRel);
    if (!importedLayer) continue;
    const impMod = detectModule(impRel);

    // Axis 1 — layers
    if (importedLayer.layer !== layerDef.layer && !allowedLayers.includes(importedLayer.layer)) {
      out.push({
        severity: severityFor(layerDef.layer),
        rule: 'dependency-rule',
        layer: layerDef.layer,
        module: mod,
        import: imp,
        importedLayer: importedLayer.layer,
        importedModule: impMod,
        message: `${layerDef.layer} must not depend on ${importedLayer.layer}`,
        fix:
          "Define an interface (port) in this module's app/ports/ and inject the concrete " +
          'implementation from main/.',
      });
      continue;
    }

    // Axis 2 — modules
    if (mod && impMod && mod !== impMod &&
        !isLegalCrossModuleImport(layerDef.layer, importedLayer.layer, impRel)) {
      out.push({
        severity: 'HIGH',
        rule: 'cross-module',
        layer: layerDef.layer,
        module: mod,
        import: imp,
        importedLayer: importedLayer.layer,
        importedModule: impMod,
        message: `module "${mod}" must not import module "${impMod}" directly`,
        fix:
          `Declare a port owned by "${mod}" (app/ports/output), implement it in ` +
          `"${mod}/infra/adapters" by calling "${impMod}/app/ports/input", and reference ` +
          `"${impMod}" entities from the domain by id only.`,
      });
    }
  }

  return out;
}
