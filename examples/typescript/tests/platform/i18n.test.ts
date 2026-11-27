import { describe, it, expect } from 'vitest';
import { createTranslator } from '@/platform/i18n/translator';
import { negotiateLocale } from '@/platform/web/locale';

describe('createTranslator', () => {
  const t = createTranslator({ en: { HELLO: 'Hello {name}', ONLY_EN: 'Only in English' }, es: { HELLO: 'Hola {name}' } }, 'en');

  it('writes the key for the locale, with its parameters', () => {
    expect(t('es', 'HELLO', { name: 'Ada' })).toBe('Hola Ada');
    expect(t('en', 'HELLO', { name: 'Ada' })).toBe('Hello Ada');
  });

  it('falls back to the default locale, then to the key itself; never to an empty text', () => {
    expect(t('es', 'ONLY_EN')).toBe('Only in English');
    expect(t('fr', 'HELLO', { name: 'Ada' })).toBe('Hello Ada');
    expect(t('es', 'MISSING')).toBe('MISSING');
  });

  it('leaves a parameter it was not given as it is', () => {
    expect(t('en', 'HELLO')).toBe('Hello {name}');
  });
});

describe('negotiateLocale', () => {
  const supported = ['en', 'es'];
  it.each([
    [undefined, 'en'],
    ['', 'en'],
    ['es', 'es'],
    ['es-AR', 'es'],
    ['ES-ar', 'es'],
    ['fr, es;q=0.5', 'es'],
    ['en;q=0.4, es;q=0.8', 'es'],
    ['es;q=0, en', 'en'],
    ['*', 'en'],
    ['fr-FR, de;q=0.8', 'en'],
  ])('Accept-Language %j → %s', (header, locale) => {
    expect(negotiateLocale(header, supported)).toBe(locale);
  });
});
