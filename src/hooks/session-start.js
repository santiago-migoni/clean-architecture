#!/usr/bin/env node
/**
 * SessionStart hook — a plugin's CLAUDE.md is never loaded into the projects that install it, so
 * the rules travel as the `rules` skill. This hook tells Claude to load that skill, but ONLY in a
 * project that uses the plugin's layout (a `modules/` folder under src/, app/ or the root): every
 * other project the user opens stays free of Clean Architecture context.
 *
 * Output: the SessionStart JSON with hookSpecificOutput.additionalContext, or nothing. Always exits 0.
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

let projectDir = process.env.CLAUDE_PROJECT_DIR || '';
if (!projectDir) {
  try {
    projectDir = JSON.parse(readFileSync(0, 'utf8')).cwd || '';
  } catch { /* no stdin */ }
}
projectDir ||= process.cwd();

const isDir = (p) => {
  try { return statSync(p).isDirectory(); } catch { return false; }
};

const modulesDir = ['src', 'app', '.']
  .map((base) => join(projectDir, base, 'modules'))
  .find((dir) => existsSync(dir) && isDir(dir));

if (modulesDir) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        'This project uses the Clean Architecture plugin layout (src/modules/<module>/{domain,app,infra}, ' +
        'src/shared, src/platform, src/main). Before writing, editing or reviewing code here, load the ' +
        '`clean-architecture:rules` skill: it holds the Dependency Rule, the Module Rule and the layout ' +
        'conventions. /clean-architecture:check scans the project for violations.',
    },
  }) + '\n');
}

process.exit(0);
