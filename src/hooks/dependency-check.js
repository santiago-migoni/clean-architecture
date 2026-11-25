#!/usr/bin/env node
/**
 * PostToolUse hook — checks the just-edited file for Dependency Rule and Module Rule
 * violations. Prints a warning to stderr (visible in Claude Code) but exits 0 so
 * Claude continues.
 *
 * The rules themselves live in ../lib/architecture.js (shared with the MCP server).
 */

import { readFileSync, existsSync } from 'fs';
import { ALLOWED_LAYERS, detectLayer, detectModule, findViolations, toPosix } from '../lib/architecture.js';

// Read file path from environment or stdin (Claude Code passes tool context)
let filePath = process.env.CLAUDE_TOOL_FILE || '';

if (!filePath) {
  try {
    const input = readFileSync('/dev/stdin', 'utf8');
    const parsed = JSON.parse(input);
    filePath = parsed.filePath || parsed.file_path || '';
  } catch { /* no stdin */ }
}

if (!filePath || !existsSync(filePath)) process.exit(0);

// Layers are detected relative to src/, never on the absolute path.
const posixPath = toPosix(filePath);
const srcIdx = posixPath.lastIndexOf('/src/');
if (srcIdx === -1) process.exit(0);
const srcDir = posixPath.slice(0, srcIdx + '/src'.length);

const rel = posixPath.slice(srcDir.length + 1);
const layerDef = detectLayer(rel);
if (!layerDef) process.exit(0);

let content;
try { content = readFileSync(filePath, 'utf8'); } catch { process.exit(0); }

const violations = findViolations(posixPath, srcDir, content);

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
      `   ✗ imports "${v.import}" — ${v.message}`,
      `     Fix: ${v.fix}`,
    ]),
    '',
    '   Run /clean-architecture:check for a full scan.',
    '',
  ].join('\n'));
}

process.exit(0);
