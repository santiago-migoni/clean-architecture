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
import { codeOnly, stringLiterals } from './strings.js';

const SYNTAX = { line: ['#'], quotes: ['"', "'"], triple: true };

// Reading the process environment, in code: os.environ / os.getenv, or the same names imported from os.
const ENVIRONMENT = /\bos\.(?:environb?|getenvb?)\b/g;
const FROM_OS = /^[ \t]*from[ \t]+os[ \t]+import[ \t]+[^\n]*?\b(environb?|getenvb?)\b/gm;

const FROM = /^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import\b/gm;
const IMPORT = /^[ \t]*import[ \t]+([^\n#;]+)/gm;

export default {
  id: 'python',
  name: 'Python',
  extensions: ['.py'],
  layout: 'src/<package>/modules/<module>/{domain,application,infrastructure}/, src/<package>/{shared,platform,main}/',

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

  // Packages whose only job is to load configuration (from .env files, the environment, config files).
  configPackages: ['dotenv', 'pydantic_settings', 'environs', 'decouple', 'dynaconf'],

  environmentAccess(content) {
    const code = codeOnly(content, SYNTAX);
    const found = [...code.matchAll(ENVIRONMENT)].map((m) => m[0]);
    for (const m of code.matchAll(FROM_OS)) found.push(`os.${m[1]}`);
    return [...new Set(found)];
  },

  embeddedSql(content) {
    return stringLiterals(content, SYNTAX).filter(looksLikeSql);
  },

  isAbstract(content) {
    return /\(\s*(?:ABC|Protocol)\s*\)|@abstractmethod/.test(content);
  },
};
