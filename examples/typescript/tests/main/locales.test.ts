import { describe, it, expect } from 'vitest';
import { LOCALES } from '@/main/locales';
import { customerMessages } from '@/modules/customers/infrastructure/controllers/customer-messages';
import { placeOrderMessages } from '@/modules/orders/infrastructure/presenters/place-order-messages';
import { webMessages } from '@/platform/web/messages';

// main/ promises that every locale the app speaks is spoken everywhere: no text falls back by accident.
describe.each([
  ['customers', customerMessages],
  ['orders', placeOrderMessages],
  ['platform/web', webMessages],
])('the %s catalog', (_name, catalog: Record<string, Record<string, string>>) => {
  it('has exactly the app locales, each with the same keys', () => {
    expect(Object.keys(catalog).sort()).toEqual([...LOCALES].sort());
    const keys = (locale: string) => Object.keys(catalog[locale]).sort();
    for (const locale of LOCALES) expect(keys(locale)).toEqual(keys(LOCALES[0]));
  });
});
