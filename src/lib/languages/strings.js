/**
 * String literals of a source file, skipping comments. Used to find SQL embedded in code: only
 * a literal can be a query, so prose in comments ("remove the item from cart") is never read as one.
 *
 *   syntax.line     line-comment markers, e.g. ['//'] or ['#']
 *   syntax.block    true when /* … *\/ comments exist
 *   syntax.quotes   quote characters that open a literal
 *   syntax.triple   true for Python's """…""" and '''…'''
 *   syntax.raw      quote characters whose literals have no escapes (Go `…`)
 */
export function stringLiterals(content, syntax) {
  const { line = [], block = false, quotes = [], triple = false, raw = [] } = syntax;
  const out = [];
  const n = content.length;
  let i = 0;
  while (i < n) {
    if (line.some((marker) => content.startsWith(marker, i))) {
      const end = content.indexOf('\n', i);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (block && content.startsWith('/*', i)) {
      const end = content.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (triple && (content.startsWith('"""', i) || content.startsWith("'''", i))) {
      const q = content.slice(i, i + 3);
      const end = content.indexOf(q, i + 3);
      out.push(content.slice(i + 3, end === -1 ? n : end));
      i = end === -1 ? n : end + 3;
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
      out.push(text);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}
