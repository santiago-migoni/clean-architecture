/**
 * Language profiles. Each one tells the engine, for one language, which files it owns, how to find
 * the imports in a file, and how to turn an import into a path that can be classified by layer and
 * module. The rules themselves (layers, modules) stay language-neutral in ../architecture.js.
 *
 * Adding a language = adding a profile here, its example under examples/<id>/, and its checks in
 * scripts/verify-example.mjs.
 *
 *   id, name, extensions
 *   layout                               → where this language's files go (shown when files are outside it)
 *   extractImports(content)              → import specifiers as written
 *   resolveImport(file, spec, srcDir)    → path relative to srcDir, or null when external
 *   isAbstract(content)                  → true for an interface / abstract type (ca_metrics)
 *   embeddedSql(content)                 → SQL statements in the file (string literals; a .sql file is one)
 *   isNeutral?(relPath, content)         → true for files that belong to no layer (e.g. __init__.py)
 *   metrics?                             → false when the files are not code (SQL): left out of ca_metrics
 */
import { extname } from 'path';
import typescript from './typescript.js';
import python from './python.js';
import go from './go.js';
import sql from './sql.js';

export const PROFILES = [typescript, python, go, sql];

const BY_EXTENSION = new Map(PROFILES.flatMap((p) => p.extensions.map((ext) => [ext, p])));

/** Source code of languages that have no profile yet: found and reported, never silently "clean". */
export const UNSUPPORTED_LANGUAGES = {
  '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin', '.cs': 'C#', '.scala': 'Scala', '.rb': 'Ruby',
  '.php': 'PHP', '.rs': 'Rust', '.swift': 'Swift', '.dart': 'Dart', '.ex': 'Elixir', '.exs': 'Elixir',
  '.cpp': 'C++', '.cc': 'C++', '.c': 'C', '.h': 'C', '.m': 'Objective-C', '.clj': 'Clojure', '.fs': 'F#',
};

export function profileFor(file) {
  return BY_EXTENSION.get(extname(file)) ?? null;
}

export function unsupportedLanguageOf(file) {
  return UNSUPPORTED_LANGUAGES[extname(file)] ?? null;
}
