/**
 * Shared architecture rules — the single source of truth used by both the MCP
 * server (src/server.js) and the PostToolUse hook (src/hooks/dependency-check.js).
 *
 * Layout (feature-first, domain / application / infrastructure):
 *
 *   src/
 *   ├── modules/<module>/
 *   │   ├── domain/            Enterprise business rules
 *   │   ├── application/       Use cases: ports/{input,output} + interactors
 *   │   └── infrastructure/    Interface adapters: controllers, presenters, gateways
 *   ├── shared/                Shared kernel (pure, minimal)
 *   ├── platform/              Frameworks & drivers: web, db, external
 *   └── main/                  Composition root
 *
 * Two axes of rules:
 *   1. Layers  — dependencies point inward: infrastructure → application → domain.
 *   2. Modules — a module never reaches into another module. The ONLY legal
 *      crossing is  A/infrastructure  →  B/application/ports/input.
 *
 * Detection always runs on a path RELATIVE to src/, never on the absolute path,
 * so a project that happens to live under /app/ is not misclassified, and it is
 * positional: a layer is the folder at its place in the layout (see classifyPath).
 *
 * The rules are language-neutral. Everything that depends on the language (which files, how imports
 * are written, how an import maps to a folder) lives in the profiles under ./languages/.
 */

import { relative } from 'path';
import { profileFor } from './languages/index.js';
import { sqlTables } from './languages/sql.js';
import { toPosix } from './paths.js';

export { toPosix };

// ── Layers ─────────────────────────────────────────────────────────────────

export const LAYERS = {
  shared:         { layer: 'shared',         level: 0 },
  domain:         { layer: 'domain',         level: 1 },
  application:    { layer: 'application',    level: 2 },
  infrastructure: { layer: 'infrastructure', level: 3 },
  platform:       { layer: 'platform',       level: 4 },
  main:           { layer: 'main',           level: 5 },
};

// Top-level folders of src/ and the layer each one is.
const TOP_LEVEL = {
  shared: 'shared',
  platform: 'platform',
  main: 'main',
  bootstrap: 'main',
  composition: 'main',
  cmd: 'main', // Go: cmd/<app>/main.go
};

// Layer folder directly under modules/<module>/. The whole infrastructure/ folder is the interface
// adapters layer: controllers/, presenters/ and gateways/ sit directly under it, and any other file
// placed there is held to the same rules.
const MODULE_LAYER = { domain: 'domain', application: 'application', infrastructure: 'infrastructure' };

// Folder names of plugin versions before 2.0 (app/, infra/ and infra/adapters/). They are still
// classified, so the rules keep protecting an old project, but ca_scan asks for the rename.
export const LEGACY_MODULE_LAYER = { app: 'application', infra: 'infrastructure' };

export const ALLOWED_LAYERS = {
  shared:         [],
  domain:         ['shared'],
  application:    ['domain', 'shared'],
  infrastructure: ['application', 'domain', 'shared'],
  platform:       ['infrastructure', 'application', 'domain', 'shared'],
  main:           ['platform', 'infrastructure', 'application', 'domain', 'shared'],
};

/** Folder names that would be ambiguous as a module name. */
export const RESERVED_MODULE_NAMES = new Set([
  'shared', 'platform', 'main', 'domain', 'application', 'infrastructure', 'modules', 'bootstrap', 'composition', 'cmd',
  // names of earlier layouts, still classified as layers
  'app', 'infra', 'adapters',
]);

// ── Path helpers ───────────────────────────────────────────────────────────

function norm(p) {
  return '/' + toPosix(p).replace(/^\.?\//, '');
}

// Classify the path as if `segs[i]` were the root of src/. Returns null if segs[i] is not a known
// top-level folder. `module` is set for anything under modules/<m>/, even without a layer folder
// (e.g. a barrel import of '@/modules/customers'), so the Module Rule still applies to it.
function classifyAt(segs, i) {
  const top = segs[i];
  if (top === 'modules') {
    const mod = segs[i + 1];
    // A module is a folder: modules/__init__.py or modules/index.ts is not a module called "__init__.py".
    if (!mod || mod.includes('.')) return null;
    const layer = MODULE_LAYER[segs[i + 2]] ?? LEGACY_MODULE_LAYER[segs[i + 2]];
    return { layer: layer ? LAYERS[layer] : null, module: mod };
  }
  // The folder itself counts (a Go or Python import names a package folder, not a file). Profiles
  // return null for external imports, so a package that is merely named "platform" never gets here.
  if (TOP_LEVEL[top]) return { layer: LAYERS[TOP_LEVEL[top]], module: null };
  return null;
}

/**
 * Classify a path relative to src/ (or an import resolved by a language profile)
 * by POSITION, never by a folder name found anywhere in the path:
 *   - src/main/application/index.ts is main (not application), src/modules/orders/domain/shared/x.ts is domain (not shared);
 *   - src/main/compose/modules/x or src/platform/modules/x is not a module.
 * An alias prefix ("@/", "~/", "src/") is skipped, and so is a Maven/Gradle source set (main/java/...).
 * When the root is not a known folder — a Java or Python package such as com/acme/modules/... or
 * shop/modules/... — the first known folder further down the path is used as the root instead.
 */
export function classifyPath(relPath) {
  let segs = toPosix(relPath).split('/').filter((s) => s !== '' && s !== '.');
  if (segs.length === 0 || segs[0] === '..') return { layer: null, module: null };
  while (['@', '~', 'src'].includes(segs[0])) segs = segs.slice(1);
  if (['main', 'test'].includes(segs[0]) && ['java', 'kotlin', 'scala'].includes(segs[1])) segs = segs.slice(2);

  const anchored = classifyAt(segs, 0);
  if (anchored) return anchored;
  for (let i = 1; i < segs.length; i++) {
    const found = classifyAt(segs, i);
    if (found) return found;
  }
  return { layer: null, module: null };
}

export function detectLayer(relPath) {
  return classifyPath(relPath).layer;
}

export function detectModule(relPath) {
  return classifyPath(relPath).module;
}

/**
 * Component = the unit of cohesion/coupling analysis.
 * Every module is its own component; shared / platform / main are components too.
 */
export function componentOf(relPath) {
  const { layer, module } = classifyPath(relPath);
  if (module) return `modules/${module}`;
  return layer ? layer.layer : null;
}

/**
 * The src/ directory a file belongs to: the nearest enclosing "src" folder (so a file in a nested
 * project such as examples/typescript/src/... is classified against examples/typescript/src, not ./src).
 * Returns null when the file is not under a src/ folder.
 */
export function srcDirForFile(file) {
  const p = toPosix(file);
  const idx = p.lastIndexOf('/src/');
  return idx === -1 ? null : p.slice(0, idx + '/src'.length);
}

// ── Imports ────────────────────────────────────────────────────────────────

/**
 * The imports of one file, each resolved by the file's language profile to a path relative to srcDir
 * (`rel`), so it can be classified exactly like a file path. `rel` is null for an external import
 * (standard library, installed package). A file with no profile has no imports here.
 */
export function fileImports(file, srcDir, content) {
  const profile = profileFor(file);
  if (!profile) return [];
  return profile.extractImports(content).map((spec) => ({ spec, rel: profile.resolveImport(file, spec, srcDir) }));
}

// ── Rules ──────────────────────────────────────────────────────────────────

/**
 * True when a path relative to src/ uses a layer folder name of an earlier layout
 * (modules/<m>/app/ or modules/<m>/infra/) instead of application/ or infrastructure/.
 */
export function usesLegacyLayerName(relPath) {
  return /(^|\/)modules\/[^/]+\/(app|infra)\//.test(toPosix(relPath));
}

/**
 * The only legal way for one module to reach another:
 *   infrastructure of module A  →  application/ports/input of module B
 */
export function isLegalCrossModuleImport(fromLayer, toLayer, importedRelPath) {
  return (
    fromLayer === 'infrastructure' &&
    toLayer === 'application' &&
    /\/(application|app)\/ports\/input(\/|$)/.test(norm(importedRelPath))
  );
}

function severityFor(layer) {
  if (layer === 'shared' || layer === 'domain') return 'CRITICAL';
  if (layer === 'application') return 'HIGH';
  return 'MEDIUM';
}

// ── SQL ────────────────────────────────────────────────────────────────────

/** Layers where SQL may live: the gateways and migrations of a module, and the database driver. */
const SQL_LAYERS = new Set(['infrastructure', 'platform']);

/** Owners of a table: exact name first, then by its last part ("sales.orders" → "orders" and back). */
function ownersOf(tables, table) {
  if (tables.has(table)) return tables.get(table);
  const short = table.split('.').pop();
  for (const [name, owners] of tables) if (name.split('.').pop() === short) return owners;
  return null;
}

/**
 * The SQL axis: where SQL may live, and which tables a module may use. `tables` is the project's
 * table → owners map (tableOwnership in ./project.js); without it only the placement rule runs.
 */
function findSqlViolations(file, layerDef, mod, content, tables) {
  const statements = profileFor(file)?.embeddedSql?.(content) ?? [];
  if (statements.length === 0) return [];
  const out = [];

  if (!SQL_LAYERS.has(layerDef.layer)) {
    out.push({
      severity: severityFor(layerDef.layer),
      rule: 'sql-placement',
      layer: layerDef.layer,
      module: mod,
      import: null,
      what: 'contains SQL',
      message: `SQL in the ${layerDef.layer} layer: only infrastructure (gateways, migrations) and platform/db may know the database`,
      fix:
        'Put the query behind an output port: declare what the use case needs in application/ports/output and ' +
        'implement it with SQL in infrastructure/gateways (schema changes in infrastructure/gateways/migrations).',
    });
  }

  if (!mod || !tables) return out;
  const reported = new Set();
  for (const sql of statements) {
    const { created, referenced } = sqlTables(sql);
    for (const table of created) {
      const owners = [...(ownersOf(tables, table) ?? [])].filter((o) => o !== 'platform');
      if (owners.length > 1 && !reported.has(`created:${table}`)) {
        reported.add(`created:${table}`);
        out.push({
          severity: 'HIGH',
          rule: 'table-ownership',
          layer: layerDef.layer,
          module: mod,
          import: null,
          table,
          what: `creates table "${table}"`,
          message: `table "${table}" is created by more than one module (${owners.sort().join(', ')})`,
          fix: "A table belongs to exactly one module: keep its CREATE TABLE in that module's migrations only.",
        });
      }
    }
    for (const table of referenced) {
      const owners = ownersOf(tables, table);
      if (!owners || owners.has(mod) || reported.has(table)) continue;
      const other = [...owners].find((o) => o !== 'platform');
      if (!other) continue;
      reported.add(table);
      out.push({
        severity: 'HIGH',
        rule: 'table-ownership',
        layer: layerDef.layer,
        module: mod,
        import: null,
        table,
        importedModule: other,
        what: `uses table "${table}"`,
        message: `module "${mod}" uses table "${table}", which belongs to module "${other}"`,
        fix:
          `Never query, alter or reference (foreign key) another module's tables. Ask "${other}" through its ` +
          `application/ports/input from a gateway in "${mod}", or keep in "${mod}" its own copy of the data it needs; ` +
          'refer to the other entity by id, without a foreign key.',
      });
    }
  }
  return out;
}

/**
 * Check one file against every axis: layers and modules (imports), and SQL (placement and table
 * ownership, when `ctx.tables` is given). Returns [] for files that do not belong to a known layer.
 */
export function findViolations(file, srcDir, content, ctx = {}) {
  const rel = toPosix(relative(srcDir, file));
  const layerDef = detectLayer(rel);
  if (!layerDef) return [];

  const mod = detectModule(rel);
  const allowedLayers = ALLOWED_LAYERS[layerDef.layer] || [];
  const out = [];

  for (const { spec: imp, rel: impRel } of fileImports(file, srcDir, content)) {
    if (impRel === null) continue; // external
    const { layer: importedLayer, module: impMod } = classifyPath(impRel);
    // A module's root (e.g. a barrel '@/modules/customers') has no layer but still belongs to a module.
    if (!importedLayer && !impMod) continue;

    // Axis 1 — layers
    if (importedLayer && importedLayer.layer !== layerDef.layer && !allowedLayers.includes(importedLayer.layer)) {
      out.push({
        severity: severityFor(layerDef.layer),
        rule: 'dependency-rule',
        layer: layerDef.layer,
        module: mod,
        import: imp,
        what: `imports "${imp}"`,
        importedLayer: importedLayer.layer,
        importedModule: impMod,
        message: `${layerDef.layer} must not depend on ${importedLayer.layer}`,
        fix:
          "Define an interface (port) in this module's application/ports/ and inject the concrete " +
          'implementation from main/.',
      });
      continue;
    }

    // Axis 2 — modules
    if (mod && impMod && mod !== impMod &&
        !isLegalCrossModuleImport(layerDef.layer, importedLayer?.layer, impRel)) {
      out.push({
        severity: 'HIGH',
        rule: 'cross-module',
        layer: layerDef.layer,
        module: mod,
        import: imp,
        what: `imports "${imp}"`,
        importedLayer: importedLayer ? importedLayer.layer : null,
        importedModule: impMod,
        message: `module "${mod}" must not import module "${impMod}" directly`,
        fix:
          `Declare a port owned by "${mod}" (application/ports/output), implement it in ` +
          `"${mod}/infrastructure/gateways" by calling "${impMod}/application/ports/input", and reference ` +
          `"${impMod}" entities from the domain by id only.`,
      });
    }
  }

  out.push(...findSqlViolations(file, layerDef, mod, content, ctx.tables));
  return out;
}
