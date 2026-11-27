/**
 * What ca_scaffold creates, per language. The layers, the module folders and the rules are the same in
 * every language; the code root, the names, the composition root and the comment syntax follow the
 * language (see "Language conventions" in skills/rules/SKILL.md).
 *
 * planScaffold() is pure: it returns the folders and files to create, and the server writes them
 * (never overwriting). Adding a language here also needs a profile in ./languages/.
 */
import { RESERVED_MODULE_NAMES } from './architecture.js';

/** "OrderManagement" → "order-management". Output is [a-z0-9-] only (path-safe). */
export function toKebab(s) {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

const LAYER_NOTES = {
  domain: (m, shared) => [`Module "${m}" — domain: enterprise business rules.`, `May import only from ${shared}.`],
  application: (m, shared) => [`Module "${m}" — application: use cases (interactors) and the ports they need.`, `May import domain and ${shared} only.`],
  infrastructure: (m) => [`Module "${m}" — infrastructure: interface adapters (controllers/, presenters/, gateways/).`, 'Never imports platform/; framework clients are injected from the composition root.'],
};

const gitkeep = (lines) => lines.map((l) => `# ${l}`).join('\n') + '\n';

// TypeScript and JavaScript differ only in the extension.
function nodeLayout(ext) {
  return {
    moduleName: toKebab,
    modulesRoot: () => 'src/modules',
    shared: () => 'src/shared/',
    mainDirs: () => ['src/main'],
    mainPath: () => '`src/main/`',
    mainStubs: () => [{
      path: `src/main/index.${ext}`,
      content:
        '// MAIN COMPONENT — Composition Root\n' +
        '// This is the ONLY file allowed to import concrete implementations from all modules and layers.\n' +
        '// Wire all dependencies here. Nothing imports from main/.\n' +
        `// With several entry points (api, worker, cli) use src/main/<app>/index.${ext} and share the modules.\n`,
    }],
    layerStub: (m, layer, ctx) => ({ path: `${ctx.modulesRoot}/${m}/${layer}/.gitkeep`, content: gitkeep(LAYER_NOTES[layer](m, ctx.shared)) }),
    extraStubs: () => [],
    layoutDoc: () =>
      'src/\n' +
      '├── modules/<module>/{domain, application, infrastructure}  # business code, one folder per module\n' +
      '├── shared/                                                 # shared kernel — create only when needed\n' +
      '├── platform/                                               # web, db, external — create only when needed\n' +
      '└── main/                                                   # composition root (main/<app>/ if several entry points)\n' +
      'tests/\n' +
      '├── <module>/{unit, integration}/\n' +
      '└── e2e/\n',
    testsNote: () => '',
    nextSteps: () => [],
  };
}

// A docstring, PEP 257 style: one line, or a summary line and paragraphs closed on their own line.
const pyDoc = (lines) => (lines.length === 1 ? `"""${lines[0]}"""\n` : `"""${lines.join('\n\n')}\n"""\n`);

const LAYOUTS = {
  typescript: nodeLayout('ts'),
  javascript: nodeLayout('js'),

  // src/<package>/ (src layout). Every folder is a package: its __init__.py replaces the .gitkeep.
  python: {
    moduleName: (s) => toKebab(s).replace(/-/g, '_'),
    modulesRoot: (ctx) => `src/${ctx.pkg}/modules`,
    shared: (ctx) => `${ctx.pkg}.shared`,
    mainDirs: (ctx) => [`src/${ctx.pkg}/main`],
    mainPath: (ctx) => `\`src/${ctx.pkg}/main/\``,
    mainStubs: (ctx) => [
      { path: `src/${ctx.pkg}/__init__.py`, content: pyDoc([`The ${ctx.domain} application. Business code lives in ${ctx.pkg}.modules.`]) },
      { path: `src/${ctx.pkg}/modules/__init__.py`, content: pyDoc(['One package per business module.']) },
      { path: `src/${ctx.pkg}/main/__init__.py`, content: '' },
      {
        path: `src/${ctx.pkg}/main/__main__.py`,
        content:
          pyDoc([
            `Composition root and entry point: python -m ${ctx.pkg}.main`,
            'The ONLY module allowed to import concrete implementations from all modules and layers.\n' +
            'Wire every dependency here; nothing imports from main.',
          ]) +
          '\n\ndef main() -> None:\n    """Wire the modules and start the application."""\n\n\n' +
          'if __name__ == "__main__":\n    main()\n',
      },
    ],
    layerStub: (m, layer, ctx) => ({ path: `${ctx.modulesRoot}/${m}/${layer}/__init__.py`, content: pyDoc(LAYER_NOTES[layer](m, ctx.shared)) }),
    extraStubs: (m, ctx) => [{ path: `${ctx.modulesRoot}/${m}/__init__.py`, content: pyDoc([`The ${m} module.`]) }],
    layoutDoc: (ctx) =>
      `src/${ctx.pkg}/\n` +
      '├── modules/<module>/{domain, application, infrastructure}  # business code, one package per module\n' +
      '├── shared/                                                 # shared kernel — create only when needed\n' +
      '├── platform/                                               # web, db, external — create only when needed\n' +
      `└── main/__main__.py                                        # composition root: python -m ${ctx.pkg}.main\n` +
      'tests/\n' +
      '├── <module>/{unit, integration}/\n' +
      '└── e2e/\n',
    testsNote: () => 'Every folder under src/ is a package (it has an `__init__.py`); file and module names are snake_case.\n\n',
    nextSteps: (ctx) => ctx.hasPyproject ? [] : [
      `Add a pyproject.toml with [tool.setuptools.packages.find] where = ["src"], so that "${ctx.pkg}" is importable (until then: PYTHONPATH=src python -m ${ctx.pkg}.main)`,
    ],
  },

  // No src/: modules under internal/modules/, wiring in internal/bootstrap/, entry point in cmd/<app>/.
  go: {
    moduleName: (s) => toKebab(s).replace(/-/g, ''), // package folders are one lowercase word
    modulesRoot: () => 'internal/modules',
    shared: () => 'internal/shared/',
    mainDirs: (ctx) => [`cmd/${ctx.app}`, 'internal/bootstrap'],
    mainPath: () => '`internal/bootstrap/`, `cmd/`',
    mainStubs: (ctx) => [
      {
        path: 'internal/bootstrap/bootstrap.go',
        content:
          '// Package bootstrap is the composition root: the ONLY package allowed to import concrete\n' +
          '// implementations from all modules and layers. Wire all dependencies here; only cmd/ imports it.\n' +
          'package bootstrap\n\n' +
          '// App holds the wired use cases that the entry points in cmd/ run.\n' +
          'type App struct{}\n\n' +
          '// New wires every module and returns the app.\n' +
          'func New() App { return App{} }\n',
      },
      {
        path: `cmd/${ctx.app}/main.go`,
        content: ctx.goModule
          ? '// Entry point: builds the app through internal/bootstrap and runs it. No wiring here.\n' +
            `package main\n\nimport "${ctx.goModule}/internal/bootstrap"\n\nfunc main() {\n\t_ = bootstrap.New()\n}\n`
          : '// Entry point: builds the app through internal/bootstrap and runs it. No wiring here.\n' +
            '// After `go mod init <module-path>`, import "<module-path>/internal/bootstrap" and call bootstrap.New().\n' +
            'package main\n\nfunc main() {}\n',
      },
    ],
    layerStub: (m, layer, ctx) => ({ path: `${ctx.modulesRoot}/${m}/${layer}/.gitkeep`, content: gitkeep(LAYER_NOTES[layer](m, ctx.shared)) }),
    extraStubs: () => [],
    layoutDoc: () =>
      'cmd/<app>/main.go                                          # entry points: call bootstrap, run\n' +
      'internal/\n' +
      '├── modules/<module>/{domain, application, infrastructure}  # business code, one folder per module\n' +
      '├── shared/                                                 # shared kernel — create only when needed\n' +
      '├── platform/                                               # drivers (db, web, clock) — create only when needed\n' +
      '└── bootstrap/                                              # composition root\n',
    testsNote: () => 'Tests are `_test.go` files beside the code; gateway tests against a real database carry `//go:build integration`.\n\n',
    nextSteps: (ctx) => ctx.goModule ? [] : ['Run `go mod init <module-path>`, then import "<module-path>/internal/bootstrap" in cmd/'],
  },
};

export const SCAFFOLD_LANGUAGES = Object.keys(LAYOUTS);

/**
 * @param args       ca_scaffold arguments (language, domain, modules)
 * @param readFile   (relativePath) → content or null: lets the plan read go.mod / pyproject.toml
 * @returns { lang, domain, modules, dirs, stubs, nextSteps }
 */
export function planScaffold(args, readFile) {
  const lang = args.language ?? 'typescript';
  const layout = LAYOUTS[lang];
  if (!layout) {
    throw new Error(`Language "${lang}" has no scaffold. Supported: ${SCAFFOLD_LANGUAGES.join(', ')}.`);
  }
  const domain = (args.domain || 'Domain').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'Domain';

  // Modules: explicit list, else one module named after the domain, else "core".
  const requested = Array.isArray(args.modules) && args.modules.length ? args.modules : [args.domain ? domain : 'core'];
  const modules = [...new Set(requested.map(layout.moduleName).filter(Boolean))].slice(0, 20);
  if (modules.length === 0) modules.push('core');
  for (const m of modules) {
    if (RESERVED_MODULE_NAMES.has(m)) throw new Error(`Module name "${m}" is reserved (it would be ambiguous with a layer folder).`);
    if (lang !== 'typescript' && lang !== 'javascript' && /^\d/.test(m)) {
      throw new Error(`Module name "${m}" starts with a digit, which is not a valid ${lang} package name.`);
    }
  }

  const pyproject = lang === 'python' ? readFile('pyproject.toml') : null;
  const pyName = pyproject && /^\s*name\s*=\s*["']([^"']+)["']/m.exec(pyproject)?.[1];
  const ctx = {
    domain,
    app: toKebab(domain).replace(/-/g, '') || 'app',
    pkg: layout.moduleName(pyName || (args.domain ? domain : 'app')) || 'app',
    hasPyproject: Boolean(pyproject),
    goModule: lang === 'go' ? /^module[ \t]+(\S+)/m.exec(readFile('go.mod') ?? '')?.[1] ?? null : null,
  };
  if (lang === 'python' && (RESERVED_MODULE_NAMES.has(ctx.pkg) || /^\d/.test(ctx.pkg))) {
    throw new Error(`Package name "${ctx.pkg}" is reserved or invalid: pass a domain name (it becomes the package under src/).`);
  }
  ctx.modulesRoot = layout.modulesRoot(ctx);
  ctx.shared = layout.shared(ctx);

  const dirs = [...layout.mainDirs(ctx), 'docs/architecture'];
  for (const m of modules) dirs.push(...['domain', 'application', 'infrastructure'].map((l) => `${ctx.modulesRoot}/${m}/${l}`));

  const stubs = [
    ...layout.mainStubs(ctx),
    { path: 'docs/architecture/ARCHITECTURE.md', content: architectureDoc(layout, ctx) },
    ...modules.flatMap((m) => [
      ...layout.extraStubs(m, ctx),
      ...['domain', 'application', 'infrastructure'].map((l) => layout.layerStub(m, l, ctx)),
    ]),
  ];
  return { lang, domain, modules, dirs, stubs, nextSteps: layout.nextSteps(ctx) };
}

function architectureDoc(layout, ctx) {
  return (
    `# ${ctx.domain} — Architecture\n\n` +
    '## Layout\n\n```\n' + layout.layoutDoc(ctx) + 'docs/architecture/                                          # this file, diagrams, ADRs\n```\n\n' +
    layout.testsNote(ctx) +
    'Subfolders (`application/ports/{input,output}`, `application/interactors`, `infrastructure/{controllers,presenters,gateways}`, ' +
    '`domain/{events,errors,services}`) are created by the first file that needs them.\n\n' +
    '## Layers (inside each module)\n\n' +
    '| Layer | Path | May import |\n|---|---|---|\n' +
    '| domain | `modules/<m>/domain/` | shared |\n' +
    '| application | `modules/<m>/application/` | domain, shared |\n' +
    '| infrastructure | `modules/<m>/infrastructure/` | application, domain, shared |\n' +
    '| platform | `platform/` | everything inward |\n' +
    `| main | ${layout.mainPath(ctx)} | everything — imported by no one |\n\n` +
    '## Dependency Rule\n\nSource code dependencies point **inward only**: infrastructure → application → domain.\n\n' +
    "## Module Rule\n\nA module never imports another module's `domain/` or `infrastructure/`.\n" +
    'The only legal crossing is `A/infrastructure` → `B/application/ports/input`, through a port owned by A.\n\n' +
    '## Database\n\n' +
    'SQL lives only in `infrastructure/` (queries in `gateways/`, schema in `gateways/migrations/`) and `platform/db/`. ' +
    "Each module owns the tables its migrations create; no module queries or references another module's tables.\n\n" +
    '## Optional pieces\n\n' +
    '- **Input Port** — required when another module (or a second entry point) calls the use case; otherwise the controller may depend on the interactor directly.\n' +
    '- **Output Port + Presenter** — use when output formatting is non-trivial or several delivery mechanisms exist; otherwise the interactor returns a response model.\n'
  );
}
