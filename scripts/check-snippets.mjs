#!/usr/bin/env node
/**
 * Every code block in skills/<skill>/references/<language>.md must parse with that language's own
 * parser: TypeScript/JavaScript with the TypeScript compiler API, Python with ast.parse, Go with
 * gofmt, JSON with JSON.parse. A reference that does not parse teaches code nobody can run.
 *
 * The examples therefore use concrete names (orders, PlaceOrder), never placeholders such as <Name>.
 *
 *   node scripts/check-snippets.mjs            # skips a language whose toolchain is missing
 *   node scripts/check-snippets.mjs --strict   # a missing toolchain is a failure (CI)
 *
 * TypeScript is loaded from node_modules here or in examples/shop (npm ci there first).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

function loadTypeScript() {
  for (const base of [ROOT, join(ROOT, 'examples/shop')]) {
    try { return createRequire(join(base, 'package.json'))('typescript'); } catch { /* next */ }
  }
  return null;
}
const ts = loadTypeScript();
const has = (cmd, args) => !spawnSync(cmd, args, { encoding: 'utf8' }).error;
const python = has('python3', ['--version']);
const gofmt = has('gofmt', ['-h']) || existsSync('/usr/local/go/bin/gofmt');

const PARSERS = {
  typescript: ts && ((code) => tsErrors(code, 'snippet.ts')),
  ts: ts && ((code) => tsErrors(code, 'snippet.ts')),
  tsx: ts && ((code) => tsErrors(code, 'snippet.tsx')),
  javascript: ts && ((code) => tsErrors(code, 'snippet.js')),
  js: ts && ((code) => tsErrors(code, 'snippet.js')),
  python: python && ((code) => run('python3', ['-c', 'import ast, sys; ast.parse(sys.stdin.read())'], code)),
  go: gofmt && ((code) => run('gofmt', ['-e'], code)),
  json: (code) => { try { JSON.parse(code); return ''; } catch (e) { return e.message; } },
};

// A placeholder can still parse in TypeScript ("class <Name> {}" is an anonymous generic class), so it is
// looked for explicitly: a <Word> right after a declaration keyword, or a lower-case <word> that is not a
// built-in type (<module>, <entity-name>).
const BUILTIN = new Set(['string', 'number', 'boolean', 'unknown', 'any', 'void', 'never', 'object', 'bigint', 'symbol', 'null', 'undefined']);
function placeholder(code) {
  const decl = /\b(?:class|interface|type|enum|function|const|let|var|new|extends|implements)\s+<\w[\w-]*>/.exec(code);
  if (decl) return decl[0];
  for (const m of code.matchAll(/<([a-z][\w-]*)>/g)) if (!BUILTIN.has(m[1])) return m[0];
  return null;
}

function tsErrors(code, fileName) {
  const sf = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true);
  const errors = sf.parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  const p = placeholder(code);
  if (p) errors.push(`placeholder ${p}: use concrete names`);
  return errors.join('; ');
}
function run(cmd, args, input) {
  const r = spawnSync(cmd, args, { input, encoding: 'utf8' });
  if (r.status === 0) return '';
  const lines = (r.stderr || r.stdout).trim().split('\n');
  return (cmd === 'python3' ? lines.slice(-2) : lines.slice(0, 3)).join(' | ');
}

/** Fenced blocks of a markdown file: { lang, code, line }. */
export function codeBlocks(md) {
  const blocks = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^```(\S*)\s*$/.exec(lines[i]);
    if (!open) continue;
    const start = i;
    const body = [];
    for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) body.push(lines[i]);
    blocks.push({ lang: open[1].toLowerCase(), code: body.join('\n') + '\n', line: start + 1 });
  }
  return blocks;
}

export function checkSnippets() {
  const failures = [];
  const skipped = new Set();
  let checked = 0;
  const skills = join(ROOT, 'skills');
  for (const skill of readdirSync(skills).sort()) {
    const refs = join(skills, skill, 'references');
    if (!existsSync(refs)) continue;
    for (const file of readdirSync(refs).filter((f) => f.endsWith('.md')).sort()) {
      const rel = `skills/${skill}/references/${file}`;
      for (const { lang, code, line } of codeBlocks(readFileSync(join(refs, file), 'utf8'))) {
        if (!(lang in PARSERS)) continue; // text, sql, toml, yaml, bash: not parsed here
        const parse = PARSERS[lang];
        if (!parse) { skipped.add(lang); continue; }
        checked++;
        const error = parse(code);
        if (error) failures.push(`${rel}:${line} (${lang}): ${error}`);
      }
    }
  }
  return { checked, failures, skipped: [...skipped] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { checked, failures, skipped } = checkSnippets();
  for (const f of failures) console.log(` FAIL  ${f}`);
  if (skipped.length) console.log(`  ${strict ? 'FAIL' : 'skip'}  no parser available for: ${skipped.join(', ')}`);
  console.log(`${checked} code block(s) parsed, ${failures.length} failure(s).`);
  process.exit(failures.length || (strict && skipped.length) ? 1 : 0);
}
