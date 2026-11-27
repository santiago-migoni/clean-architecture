// eslint.config.js — enforces the Dependency Rule (layers) and the Module Rule (modules).
// Written for eslint-plugin-boundaries v7 (`boundaries/dependencies` + policies).
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';

// Same module as the importing file
const same = (type) => ({
  element: { type, captured: { module: '{{ from.element.captured.module }}' } },
});
// Any file of that type
const any = (type) => ({ element: { type } });

// from → [allowed targets]
const rule = (from, ...targets) =>
  targets.map((to) => ({ from: { element: { type: from } }, allow: { to } }));

export default [
  { files: ['src/**/*.ts'], languageOptions: { parser: tseslint.parser } },
  {
    files: ['src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
      'boundaries/include': ['src/**/*'],
      // Order matters: the first matching descriptor wins, so `input-port` and `published` precede `application`.
      'boundaries/elements': [
        { type: 'shared',         pattern: 'src/shared',                            partialMatch: false },
        { type: 'domain',         pattern: 'src/modules/*/domain',                  partialMatch: false, capture: ['module'] },
        { type: 'input-port',     pattern: 'src/modules/*/application/ports/input', partialMatch: false, capture: ['module'] },
        { type: 'published',      pattern: 'src/modules/*/application/ports/published', partialMatch: false, capture: ['module'] },
        { type: 'application',    pattern: 'src/modules/*/application',             partialMatch: false, capture: ['module'] },
        { type: 'infrastructure', pattern: 'src/modules/*/infrastructure',          partialMatch: false, capture: ['module'] },
        { type: 'platform',       pattern: 'src/platform',                          partialMatch: false },
        { type: 'main',           pattern: 'src/main',                              partialMatch: false },
      ],
    },
    rules: {
      'boundaries/dependencies': [2, {
        default: 'disallow',
        policies: [
          // Layers — inward only, and only inside the SAME module
          ...rule('domain',      { element: { type: 'shared' } }, same('domain')),
          ...rule('application', { element: { type: 'shared' } }, same('domain'), same('application'), same('input-port'),
                  same('published')),
          ...rule('input-port',  { element: { type: 'shared' } }, same('domain'), same('application'), same('input-port')),
          // A published contract is plain data: shared and other contracts only (never its module's domain)
          ...rule('published',   { element: { type: 'shared' } }, same('published')),
          ...rule('infrastructure', { element: { type: 'shared' } }, same('domain'), same('application'), same('input-port'),
                            same('published'), same('infrastructure'),
                            // The two legal cross-module edges, both into another module's public surface:
                            // a call (its application/ports/input) and a subscription (its application/ports/published)
                            any('input-port'), any('published')),
          ...rule('platform', any('shared'), any('domain'), any('application'), any('input-port'), any('published'),
                  any('infrastructure'), any('platform')),
          ...rule('main', any('shared'), any('domain'), any('application'), any('input-port'), any('published'),
                  any('infrastructure'), any('platform'), any('main')),
        ],
      }],
    },
  },
];
