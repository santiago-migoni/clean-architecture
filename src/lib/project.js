/**
 * Project-wide facts the rules need beyond one file: which source files exist, and which module
 * owns each table. Shared by the MCP server and the PostToolUse hook.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from 'fs';
import { extname, join, relative } from 'path';
import { classifyPath } from './architecture.js';
import { PROFILES, UNSUPPORTED_LANGUAGES, profileFor } from './languages/index.js';
import { sqlTables } from './languages/sql.js';
import { toPosix } from './paths.js';

// Every extension a profile owns, plus source code of languages without a profile (reported, not checked).
const SOURCE_EXTENSIONS = new Set([...PROFILES.flatMap((p) => p.extensions), ...Object.keys(UNSUPPORTED_LANGUAGES)]);
// Dependencies, virtual environments and build output: never the project's own source.
const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'venv', 'vendor', 'dist']);

export function walkSource(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const lstat = lstatSync(full);
    if (lstat.isSymbolicLink()) continue; // never follow symlinks
    if (lstat.isDirectory()) files.push(...walkSource(full));
    else if (SOURCE_EXTENSIONS.has(extname(full))) files.push(full);
  }
  return files;
}

/**
 * table → owners: the modules (or "platform") whose files create it. A table has exactly one owner
 * when the project is healthy; findViolations reports a table created by two modules.
 * `read(file)` returns the file's content (the server passes its cache).
 */
export function tableOwnership(srcDir, files, read = (f) => readFileSync(f, 'utf8')) {
  const tables = new Map();
  for (const file of files) {
    const profile = profileFor(file);
    if (!profile?.embeddedSql) continue;
    const { layer, module } = classifyPath(toPosix(relative(srcDir, file)));
    const owner = module ?? (layer?.layer === 'platform' ? 'platform' : null);
    if (!owner) continue;
    let content;
    try { content = read(file); } catch { continue; }
    for (const sql of profile.embeddedSql(content)) {
      for (const table of sqlTables(sql).created) {
        if (!tables.has(table)) tables.set(table, new Set());
        tables.get(table).add(owner);
      }
    }
  }
  return tables;
}
