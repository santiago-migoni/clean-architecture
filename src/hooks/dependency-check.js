#!/usr/bin/env node
/**
 * PostToolUse hook — checks the just-edited file for Dependency Rule and Module Rule
 * violations. Prints a warning to stderr (visible in Claude Code) but exits 0 so
 * Claude continues.
 *
 * The rules themselves live in ../lib/architecture.js (shared with the MCP server).
 */

import { readFileSync, existsSync } from 'fs';
import { join, relative, isAbsolute } from 'path';
import { ALLOWED_LAYERS, detectLayer, detectModule, findViolations, srcDirForFile, toPosix } from '../lib/architecture.js';
import { profileFor } from '../lib/languages/index.js';
import { tableOwnership, walkSource } from '../lib/project.js';

// File path: CLAUDE_TOOL_FILE (manual runs and tests), else the PostToolUse JSON on stdin,
// where Claude Code puts it in tool_input.file_path (top-level keys kept for older callers).
let filePath = process.env.CLAUDE_TOOL_FILE || '';
let projectDir = process.env.CLAUDE_PROJECT_DIR || '';

if (!filePath) {
  try {
    const parsed = JSON.parse(readFileSync(0, 'utf8'));
    filePath = parsed.tool_input?.file_path || parsed.filePath || parsed.file_path || '';
    projectDir ||= parsed.cwd || '';
  } catch { /* no stdin */ }
}

if (!filePath || !existsSync(filePath)) process.exit(0);

// Layers are detected relative to src/, never on the absolute path. Without a src/ folder
// (e.g. a Python project rooted at app/ or lib/), the project root plays that role, exactly as
// in ca_scan: <root>/src if it exists, else <root>.
const posixPath = toPosix(filePath);
let srcDir = srcDirForFile(posixPath);
if (!srcDir) {
  const root = projectDir || process.cwd();
  const candidate = toPosix(existsSync(join(root, 'src')) ? join(root, 'src') : root);
  const relToRoot = relative(candidate, posixPath);
  if (relToRoot.startsWith('..') || isAbsolute(relToRoot)) process.exit(0); // outside the project
  srcDir = candidate;
}

const rel = posixPath.slice(srcDir.length + 1);
const layerDef = detectLayer(rel);
if (!layerDef) process.exit(0);

let content;
try { content = readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

// Table ownership needs every module's migrations: walk the project only when this file has SQL.
const hasSql = (profileFor(posixPath)?.embeddedSql?.(content) ?? []).length > 0;
const tables = hasSql ? tableOwnership(srcDir, walkSource(srcDir)) : null;
const violations = findViolations(posixPath, srcDir, content, { tables });

if (violations.length > 0) {
  const mod = detectModule(rel);
  const allowed = ALLOWED_LAYERS[layerDef.layer] || [];
  process.stderr.write([
    '',
    '⚠️  CLEAN ARCHITECTURE — ARCHITECTURE RULE VIOLATION',
    `   File:  ${filePath}`,
    `   Layer: ${layerDef.layer.toUpperCase()}${mod ? ` (module: ${mod})` : ''} ` +
      `(may only depend on: ${allowed.join(', ') || 'nothing'})`,
    '',
    ...violations.flatMap((v) => [
      `   ✗ ${v.what} — ${v.message}`,
      `     Fix: ${v.fix}`,
    ]),
    '',
    '   Run /clean-architecture:check for a full scan.',
    '',
  ].join('\n'));
}

process.exit(0);
