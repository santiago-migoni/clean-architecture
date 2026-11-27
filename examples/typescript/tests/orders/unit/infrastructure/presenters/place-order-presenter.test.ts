import { describe, it, expect } from 'vitest';
import { PlaceOrderPresenter } from '@/modules/orders/infrastructure/presenters/place-order-presenter';
import { placeOrderMessages } from '@/modules/orders/infrastructure/presenters/place-order-messages';
import { CustomerNotFoundError } from '@/modules/orders/application/errors/customer-not-found-error';
import { InvalidOrderError } from '@/modules/orders/domain/errors/invalid-order-error';
import { createTranslator } from '@/platform/i18n/translator';

const presenter = (locale = 'en') => new PlaceOrderPresenter(createTranslator(placeOrderMessages, 'en'), locale);

describe('PlaceOrderPresenter (no HTTP stack)', () => {
  it('formats the response model into a view model', () => {
    const p = presenter();
    p.present({ orderId: 'o-1', status: 'PENDING', totalCents: 123456 });
    expect(p.viewModel).toEqual({ orderId: 'o-1', statusLabel: 'Pending', total: '$1,234.56' });
    expect(p.hasError).toBe(false);
  });

  it('writes the status in the request language; the amount stays in dollars', () => {
    const p = presenter('es');
    p.present({ orderId: 'o-1', status: 'PENDING', totalCents: 123456 });
    expect(p.viewModel).toEqual({ orderId: 'o-1', statusLabel: 'Pendiente', total: '$1,234.56' });
  });

  it('keeps an unknown status readable instead of failing', () => {
    const p = presenter();
    p.present({ orderId: 'o-1', status: 'SHIPPED', totalCents: 0 });
    expect(p.viewModel).toMatchObject({ statusLabel: 'SHIPPED', total: '$0.00' });
  });

  it.each([
    ['en', new CustomerNotFoundError('c-9'), 'CUSTOMER_NOT_FOUND', 'Customer c-9 not found'],
    ['es', new CustomerNotFoundError('c-9'), 'CUSTOMER_NOT_FOUND', 'No existe el cliente c-9'],
    ['en', new InvalidOrderError('NO_LINES', 'log text'), 'INVALID_ORDER', 'Order must have at least one line'],
    ['es', new InvalidOrderError('NO_LINES', 'log text'), 'INVALID_ORDER', 'El pedido debe tener al menos una línea'],
  ])('maps a known failure to a code and a text for the locale (%s, %#)', (locale, error, code, message) => {
    const p = presenter(locale);
    p.presentError(error);
    expect(p.hasError).toBe(true);
    expect(p.errorViewModel).toEqual({ code, message });
  });

  it('never leaks the message of an unexpected failure', () => {
    const p = presenter();
    p.presentError(new Error('SQLITE_ERROR: no such table: orders'));
    expect(p.errorViewModel).toEqual({ code: 'UNKNOWN_ERROR', message: 'Unexpected error' });
  });
});
