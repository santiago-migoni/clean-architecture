/**
 * Python profile.
 * Imports: "import a.b, c as d" and "from a.b import x" / "from ..pkg import x", also when indented
 * (inside try:, def or if). Relative imports are resolved against the file. An absolute import is
 * part of the project only when its top-level package exists under src/ (or the root); anything else
 * (standard library, installed packages) is external.
 */
import { existsSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { toPosix } from '../paths.js';
import { looksLikeSql } from './sql.js';
import { stringLiterals } from './strings.js';

const SYNTAX = { line: ['#'], quotes: ['"', "'"], triple: true };

const FROM = /^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import\b/gm;
const IMPORT = /^[ \t]*import[ \t]+([^\n#;]+)/gm;

export default {
  id: 'python',
  name: 'Python',
  extensions: ['.py'],

  extractImports(content) {
    const found = new Set();
    for (const m of content.matchAll(FROM)) found.add(m[1]);
    for (const m of content.matchAll(IMPORT)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+/)[0];
        if (/^[\w.]+$/.test(name)) found.add(name);
      }
    }
    return [...found];
  },

  resolveImport(file, spec, srcDir) {
    const rel = /^(\.+)([\w.]*)$/.exec(spec);
    if (rel) {
      const [, dots, rest] = rel;
      let base = dirname(file);
      for (let i = 1; i < dots.length; i++) base = dirname(base);
      return toPosix(relative(srcDir, resolve(base, rest.replace(/\./g, '/'))));
    }
    const top = spec.split('.')[0];
    if (!existsSync(join(srcDir, top)) && !existsSync(join(srcDir, `${top}.py`))) return null;
    return spec.replace(/\./g, '/');
  },

  // A package marker (__init__.py) with no code of its own belongs to no layer and is not reported.
  isNeutral(relPath, content) {
    return /(^|\/)__init__\.py$/.test(relPath) && !/^[ \t]*(def|class|async def)\b/m.test(content);
  },

  embeddedSql(content) {
    return stringLiterals(content, SYNTAX).filter(looksLikeSql);
  },

  isAbstract(content) {
    return /\(\s*(?:ABC|Protocol)\s*\)|@abstractmethod/.test(content);
  },
};
