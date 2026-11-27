/**
 * TypeScript / JavaScript profile.
 * Imports: static import/export ... from, side-effect imports, dynamic import() and require().
 * Relative specifiers are resolved against the file; aliases ("@/", "~/", "src/") are kept as
 * written, because classifyPath skips them. A bare specifier is project code only when it is a path
 * whose first segment is a folder under src/ (a baseUrl import such as "modules/orders/domain/order");
 * any other one is a package ("express", "platform", "@scope/pkg", "node:fs") and external.
 */
import { existsSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { toPosix } from '../paths.js';
import { looksLikeSql } from './sql.js';
import { stringLiterals } from './strings.js';

const SYNTAX = { line: ['//'], block: true, quotes: ['"', "'", '`'] };

const PATTERNS = [
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g, // import x from '…' / export * from '…' / import '…'
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,                                      // import('…')
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,                                     // require('…')
];

export default {
  id: 'typescript',
  name: 'TypeScript / JavaScript',
  extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
  layout: 'src/modules/<module>/{domain,application,infrastructure}/, src/shared/, src/platform/, src/main/',

  extractImports(content) {
    const found = new Set();
    for (const pattern of PATTERNS) {
      for (const m of content.matchAll(new RegExp(pattern.source, pattern.flags))) found.add(m[1]);
    }
    return [...found];
  },

  resolveImport(file, spec, srcDir) {
    if (spec.startsWith('.')) return toPosix(relative(srcDir, resolve(dirname(file), spec)));
    if (/^(?:@|~|src)\//.test(spec)) return spec;
    // "platform" alone is a package; "platform/web/server" with a src/platform folder is a baseUrl import.
    const [first, ...rest] = spec.split('/');
    return rest.length && !first.startsWith('@') && !first.includes(':') && existsSync(join(srcDir, first)) ? spec : null;
  },

  embeddedSql(content) {
    return stringLiterals(content, SYNTAX).filter(looksLikeSql);
  },

  isAbstract(content) {
    return /\binterface\s+\w|\babstract\s+class\s+\w/.test(content);
  },
};
