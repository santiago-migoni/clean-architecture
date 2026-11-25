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
      // Order matters: the first matching descriptor wins, so `input-port` precedes `app`.
      'boundaries/elements': [
        { type: 'shared',     pattern: 'src/shared',                      partialMatch: false },
        { type: 'domain',     pattern: 'src/modules/*/domain',            partialMatch: false, capture: ['module'] },
        { type: 'input-port', pattern: 'src/modules/*/app/ports/input',   partialMatch: false, capture: ['module'] },
        { type: 'app',        pattern: 'src/modules/*/app',               partialMatch: false, capture: ['module'] },
        { type: 'infra',      pattern: 'src/modules/*/infra',             partialMatch: false, capture: ['module'] },
        { type: 'platform',   pattern: 'src/platform',                    partialMatch: false },
        { type: 'main',       pattern: 'src/main',                        partialMatch: false },
      ],
    },
    rules: {
      'boundaries/dependencies': [2, {
        default: 'disallow',
        policies: [
          // Layers — inward only, and only inside the SAME module
          ...rule('domain', { element: { type: 'shared' } }, same('domain')),
          ...rule('app',    { element: { type: 'shared' } }, same('domain'), same('app'), same('input-port')),
          ...rule('input-port', { element: { type: 'shared' } }, same('domain'), same('app'), same('input-port')),
          ...rule('infra',  { element: { type: 'shared' } }, same('domain'), same('app'), same('input-port'), same('infra'),
                            // The ONE legal cross-module edge: infra → another module's app/ports/input
                            any('input-port')),
          ...rule('platform', any('shared'), any('domain'), any('app'), any('input-port'), any('infra'), any('platform')),
          ...rule('main', any('shared'), any('domain'), any('app'), any('input-port'), any('infra'), any('platform'), any('main')),
        ],
      }],
    },
  },
];
