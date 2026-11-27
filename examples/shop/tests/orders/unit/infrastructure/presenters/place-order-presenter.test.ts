import { describe, it, expect } from 'vitest';
import { PlaceOrderPresenter } from '@/modules/orders/infrastructure/presenters/place-order-presenter';
import { CustomerNotFoundError } from '@/modules/orders/application/errors/customer-not-found-error';
import { InvalidOrderError } from '@/modules/orders/domain/errors/invalid-order-error';

describe('PlaceOrderPresenter (no HTTP stack)', () => {
  it('formats the response model into a view model', () => {
    const p = new PlaceOrderPresenter();
    p.present({ orderId: 'o-1', status: 'PENDING', totalCents: 123456 });
    expect(p.viewModel).toEqual({ orderId: 'o-1', statusLabel: 'Pending', total: '$1,234.56' });
    expect(p.hasError).toBe(false);
  });

  it('keeps an unknown status readable instead of failing', () => {
    const p = new PlaceOrderPresenter();
    p.present({ orderId: 'o-1', status: 'SHIPPED', totalCents: 0 });
    expect(p.viewModel).toMatchObject({ statusLabel: 'SHIPPED', total: '$0.00' });
  });

  it.each([
    [new CustomerNotFoundError('c-9'), 'CUSTOMER_NOT_FOUND', 'Customer c-9 not found'],
    [new InvalidOrderError('Order must have at least one line'), 'INVALID_ORDER', 'Order must have at least one line'],
  ])('maps a known failure to an error view model (%#)', (error, code, message) => {
    const p = new PlaceOrderPresenter();
    p.presentError(error);
    expect(p.hasError).toBe(true);
    expect(p.errorViewModel).toEqual({ code, message });
  });

  it('never leaks the message of an unexpected failure', () => {
    const p = new PlaceOrderPresenter();
    p.presentError(new Error('SQLITE_ERROR: no such table: orders'));
    expect(p.errorViewModel).toEqual({ code: 'UNKNOWN_ERROR', message: 'Unexpected error' });
  });
});
