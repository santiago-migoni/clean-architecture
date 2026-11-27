/** Path helpers shared by the engine and the language profiles. */
export function toPosix(p) {
  return p.replace(/\\/g, '/');
}
