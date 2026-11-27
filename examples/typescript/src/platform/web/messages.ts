// src/platform/web/messages.ts — the answers platform/web writes itself (no module is involved in them).
import type { Catalog } from '../i18n/translator';

export const webMessages: Catalog = {
  en: { MALFORMED_JSON: 'Malformed JSON', UNKNOWN_ERROR: 'Unexpected error' },
  es: { MALFORMED_JSON: 'JSON mal formado', UNKNOWN_ERROR: 'Error inesperado' },
};
