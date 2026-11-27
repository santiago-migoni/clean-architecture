// src/platform/i18n/translator.ts — turns a message key into text for a locale. A driver, like the database:
// a project that adopts an i18n library (i18next, FormatJS) replaces this file, and no module changes.
// Each module keeps its own catalog beside the adapter that writes the text; main/ builds one translator per catalog.

/** locale → key → text. Parameters are written as {name}. */
export type Catalog = Readonly<Record<string, Readonly<Record<string, string>>>>;

export type Translate = (locale: string, key: string, params?: Readonly<Record<string, string>>) => string;

/** A missing locale or key falls back to `fallbackLocale`, then to the key itself (never to an empty string). */
export function createTranslator(catalog: Catalog, fallbackLocale: string): Translate {
  return (locale, key, params = {}) => {
    const text = catalog[locale]?.[key] ?? catalog[fallbackLocale]?.[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => params[name] ?? whole);
  };
}
