// src/platform/web/locale.ts — which of the supported locales a request wants (Accept-Language). HTTP detail.

/**
 * The first supported language in the client's order of preference (q weights, then position), matched by its
 * primary subtag ("es-AR" → "es"). `supported[0]` is the default: no header, "*", or nothing supported.
 */
export function negotiateLocale(acceptLanguage: string | undefined, supported: readonly string[]): string {
  const wanted = (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined);
      return { language: tag.trim().split('-')[0].toLowerCase(), q: q === undefined ? 1 : Number(q), index };
    })
    .filter((w) => w.language !== '' && w.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return wanted.find((w) => supported.includes(w.language))?.language ?? supported[0];
}
