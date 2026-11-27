/**
 * Go profile.
 * Imports: single and grouped imports, with or without an alias ("x", _, .). An import belongs to the
 * project when it starts with the module path declared in the nearest go.mod; the rest of it is a
 * folder under that go.mod. Standard library and third-party packages are external, even when their
 * path happens to contain "modules/".
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { toPosix } from '../paths.js';
import { looksLikeSql } from './sql.js';
import { codeOnly, stringLiterals } from './strings.js';

const SYNTAX = { line: ['//'], block: true, quotes: ['"', '`', "'"], raw: ['`'] }; // ' is a rune: skipped like a string

// Reading the process environment, in code.
const ENVIRONMENT = /\b(?:os\.(?:Getenv|LookupEnv|Environ)|syscall\.(?:Getenv|Environ))\b/g;

const SINGLE = /^[ \t]*import[ \t]+(?:[\w.]+[ \t]+)?"([^"]+)"/gm;
const GROUP = /^[ \t]*import[ \t]*\(([\s\S]*?)\)/gm;
const IN_GROUP = /^[ \t]*(?:[\w.]+[ \t]+)?"([^"]+)"/gm;

const goModCache = new Map();

/** { dir, module } of the nearest go.mod above `file`, or null. */
function goModFor(file) {
  let dir = dirname(file);
  const seen = [];
  for (;;) {
    if (goModCache.has(dir)) break;
    seen.push(dir);
    const goMod = join(dir, 'go.mod');
    if (existsSync(goMod)) {
      const module = /^module[ \t]+(\S+)/m.exec(readFileSync(goMod, 'utf8'))?.[1];
      goModCache.set(dir, module ? { dir, module } : null);
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) { goModCache.set(dir, null); break; }
    dir = parent;
  }
  const found = goModCache.get(dir);
  for (const d of seen) goModCache.set(d, found);
  return found;
}

export default {
  id: 'go',
  name: 'Go',
  extensions: ['.go'],
  layout: 'internal/modules/<module>/{domain,application,infrastructure}/, internal/{shared,platform,bootstrap}/, cmd/<app>/',

  extractImports(content) {
    const found = new Set();
    for (const m of content.matchAll(SINGLE)) found.add(m[1]);
    for (const g of content.matchAll(GROUP)) {
      for (const m of g[1].matchAll(IN_GROUP)) found.add(m[1]);
    }
    return [...found];
  },

  resolveImport(file, spec, srcDir) {
    const mod = goModFor(file);
    if (!mod) return spec; // no go.mod: classify the path as written
    if (spec !== mod.module && !spec.startsWith(`${mod.module}/`)) return null;
    return toPosix(relative(srcDir, join(mod.dir, spec.slice(mod.module.length + 1))));
  },

  // Tests sit beside the code in Go; they are their own composition root and may read the environment.
  isTest(relPath) {
    return /_test\.go$/.test(relPath);
  },

  // Packages that belong to one place only (see PACKAGE_RULES in ../architecture.js).
  packages: {
    config: ['github.com/spf13/viper', 'github.com/joho/godotenv', 'github.com/kelseyhightower/envconfig',
      'github.com/caarlos0/env', 'github.com/sethvargo/go-envconfig'],
    i18n: ['golang.org/x/text/message', 'golang.org/x/text/language', 'github.com/nicksnyder/go-i18n',
      'github.com/leonelquinteros/gotext', 'github.com/chai2010/gettext-go'],
  },

  environmentAccess(content) {
    return [...new Set([...codeOnly(content, SYNTAX).matchAll(ENVIRONMENT)].map((m) => m[0]))];
  },

  embeddedSql(content) {
    return stringLiterals(content, SYNTAX).filter(looksLikeSql);
  },

  isAbstract(content) {
    return /\btype\s+\w+\s+interface\b/.test(content);
  },
};
