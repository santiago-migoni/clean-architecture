/**
 * A source file split into code, string literals and comments. Two views of it are used:
 *   - stringLiterals: only the literals, to find SQL embedded in code (only a literal can be a query, so
 *     prose in comments, "remove the item from cart", is never read as one);
 *   - codeOnly: the code with every literal and comment blanked out, to find what the code does
 *     (process.env, os.Getenv) without matching a comment or a string that merely mentions it.
 *
 *   syntax.line     line-comment markers, e.g. ['//'] or ['#']
 *   syntax.block    true when /* … *\/ comments exist
 *   syntax.quotes   quote characters that open a literal
 *   syntax.triple   true for Python's """…""" and '''…'''
 *   syntax.raw      quote characters whose literals have no escapes (Go `…`)
 */

/** Spans of the file that are not code: { kind: 'comment' | 'string', start, end, text } (text: a literal's content). */
function spans(content, syntax) {
  const { line = [], block = false, quotes = [], triple = false, raw = [] } = syntax;
  const out = [];
  const n = content.length;
  let i = 0;
  while (i < n) {
    if (line.some((marker) => content.startsWith(marker, i))) {
      const end = content.indexOf('\n', i);
      out.push({ kind: 'comment', start: i, end: end === -1 ? n : end });
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (block && content.startsWith('/*', i)) {
      const end = content.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out.push({ kind: 'comment', start: i, end: stop });
      i = stop;
      continue;
    }
    if (triple && (content.startsWith('"""', i) || content.startsWith("'''", i))) {
      const q = content.slice(i, i + 3);
      const end = content.indexOf(q, i + 3);
      const stop = end === -1 ? n : end + 3;
      out.push({ kind: 'string', start: i, end: stop, text: content.slice(i + 3, end === -1 ? n : end) });
      i = stop;
      continue;
    }
    const c = content[i];
    if (quotes.includes(c)) {
      const multiline = c === '`';
      const escapes = !raw.includes(c);
      let j = i + 1;
      let text = '';
      while (j < n && content[j] !== c) {
        if (escapes && content[j] === '\\') { text += content[j + 1] ?? ''; j += 2; continue; }
        if (!multiline && content[j] === '\n') break;
        text += content[j++];
      }
      out.push({ kind: 'string', start: i, end: Math.min(j + 1, n), text });
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

export function stringLiterals(content, syntax) {
  return spans(content, syntax).filter((s) => s.kind === 'string').map((s) => s.text);
}

/** The file with literals and comments replaced by spaces (line breaks kept, so positions still match). */
export function codeOnly(content, syntax) {
  let out = '';
  let at = 0;
  for (const s of spans(content, syntax)) {
    out += content.slice(at, s.start) + content.slice(s.start, s.end).replace(/[^\n]/g, ' ');
    at = s.end;
  }
  return out + content.slice(at);
}
