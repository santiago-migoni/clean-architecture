/**
 * SQL profile, and the SQL reader shared by every language.
 *
 * SQL has no imports: its dependencies are TABLES. A table belongs to the module whose migrations
 * create it, and the rules on SQL (see findSqlViolations in ../architecture.js) are:
 *   1. SQL lives only in infrastructure (gateways, migrations) and platform/db;
 *   2. a module uses only its own tables — querying, altering or referencing (foreign key) another
 *      module's table is the database version of importing its domain.
 *
 * SQL is found in .sql files and, through each code profile's embeddedSql(), in string literals that
 * start like a statement (SELECT … FROM, INSERT INTO, UPDATE … SET, DELETE FROM, WITH … AS (, CREATE,
 * ALTER, DROP, TRUNCATE).
 */

const IDENT = '(?:"[^"]+"|`[^`]+`|\\[[^\\]]+\\]|[A-Za-z_][\\w$]*)';
const NAME = `(${IDENT}(?:\\.${IDENT})?)(?![\\w$."\`\\]])`;
const NOT_CALL = '(?!\\s*\\()'; // FROM json_each(...) is a function, not a table

const CREATED = [
  new RegExp(`\\bcreate\\s+(?:(?:global|local)\\s+)?(?:(?:temporary|temp|unlogged)\\s+)?(?:table|view)\\s+(?:if\\s+not\\s+exists\\s+)?${NAME}`, 'gi'),
];
const REFERENCED = [
  new RegExp(`\\b(?:from|join)\\s+(?:only\\s+)?${NAME}${NOT_CALL}`, 'gi'),
  new RegExp(`\\b(?:into|references)\\s+(?:only\\s+)?${NAME}`, 'gi'), // INTO t (cols), REFERENCES t (id)
  new RegExp(`\\bupdate\\s+(?:only\\s+)?${NAME}\\s+(?:as\\s+\\w+\\s+)?set\\b`, 'gi'),
  new RegExp(`\\b(?:alter|drop)\\s+(?:table|view)\\s+(?:if\\s+exists\\s+)?(?:only\\s+)?${NAME}`, 'gi'),
  new RegExp(`\\btruncate\\s+(?:table\\s+)?${NAME}`, 'gi'),
  new RegExp(`\\bcreate\\s+(?:unique\\s+)?index\\s+(?:if\\s+not\\s+exists\\s+)?(?:${IDENT}\\s+)?on\\s+(?:only\\s+)?${NAME}`, 'gi'),
];

const STATEMENT = /^\s*(?:select\b[\s\S]*\bfrom\b|insert\s+(?:or\s+\w+\s+)?into\b|update\s+\S+\s+set\b|delete\s+from\b|with\s+(?:recursive\s+)?\w+\s+as\s*\(|create\s+(?:or\s+replace\s+)?(?:(?:global|local)\s+)?(?:(?:temporary|temp|unlogged)\s+)?(?:unique\s+)?(?:table|index|view)\b|alter\s+table\b|drop\s+(?:table|index|view)\b|truncate\b)/i;

// Something only SQL has. Needed when the statement is written in lower case, so that a message such as
// "select a customer from the list" or "Delete from cart failed" is not read as a query.
const EVIDENCE = /\bwhere\b|\bjoin\b|\bvalues\b|\bset\b|\bgroup\s+by\b|\border\s+by\b|\blimit\b|\breturning\b|[?;*(,]|\$\d|:\w/i;

/** True when a string literal is an SQL statement (upper-case keyword, or lower case plus evidence). */
export function looksLikeSql(text) {
  if (!STATEMENT.test(text)) return false;
  const keyword = /^\s*([A-Za-z]+)/.exec(text)[1];
  return keyword === keyword.toUpperCase() || EVIDENCE.test(text);
}

const normalize = (name) => name.replace(/["`[\]]/g, '').toLowerCase();

/** Comments and string literals removed: 'moved from customers' is data, not a table. */
function code(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

/** { created, referenced }: table (and view) names, lower-cased, without quotes. */
export function sqlTables(sql) {
  const text = code(sql);
  const collect = (patterns) => {
    const found = new Set();
    for (const p of patterns) for (const m of text.matchAll(new RegExp(p.source, p.flags))) found.add(normalize(m[1]));
    return [...found];
  };
  const created = collect(CREATED);
  return { created, referenced: collect(REFERENCED) };
}

export default {
  id: 'sql',
  name: 'SQL',
  extensions: ['.sql'],
  metrics: false, // tables, not types: SQL files do not count in abstractness or fan-in/fan-out
  extractImports: () => [],
  resolveImport: () => null,
  isAbstract: () => false,
  embeddedSql: (content) => [content],
};
