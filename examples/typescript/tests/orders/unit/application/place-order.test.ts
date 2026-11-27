import { describe, it, expect, beforeEach, vi, type Mocked } from 'vitest';
import { PlaceOrderInteractor } from '@/modules/orders/application/interactors/place-order';
import type { IPlaceOrderOutputPort } from '@/modules/orders/application/ports/output/place-order-output';
import type { ICustomerLookup } from '@/modules/orders/application/ports/output/customer-lookup';
import { CustomerNotFoundError } from '@/modules/orders/application/errors/customer-not-found-error';
import { InvalidOrderError } from '@/modules/orders/domain/errors/invalid-order-error';
import { OrderInMemoryRepository } from '@/modules/orders/infrastructure/gateways/in-memory/order-in-memory-repository';
import { RecordingOrderEvents } from '@/modules/orders/infrastructure/gateways/in-memory/recording-order-events';

const lines = [{ productId: 'p1', quantity: 2, unitPriceCents: 1000 }];

describe('PlaceOrderInteractor (no DB, customers module NOT imported)', () => {
  let repository: OrderInMemoryRepository;
  let outputPort: Mocked<IPlaceOrderOutputPort>;
  let customerLookup: Mocked<ICustomerLookup>;
  let interactor: PlaceOrderInteractor;
  let events: RecordingOrderEvents;

  beforeEach(() => {
    repository = new OrderInMemoryRepository();
    outputPort = { present: vi.fn(), presentError: vi.fn() };
    customerLookup = { exists: vi.fn().mockResolvedValue(true) }; // port faked in orders' own vocabulary
    events = new RecordingOrderEvents();
    interactor = new PlaceOrderInteractor(outputPort, repository, customerLookup, () => 'o-1', events);
  });

  it('presents the response model for an existing customer', async () => {
    await interactor.execute({ customerId: 'c-1', lines });
    expect(outputPort.present).toHaveBeenCalledWith({ orderId: 'o-1', status: 'PENDING', totalCents: 2000 });
    expect(outputPort.presentError).not.toHaveBeenCalled();
    expect(await repository.findAll()).toHaveLength(1);
    expect(events.published).toEqual([{ type: 'OrderPlaced', orderId: 'o-1', customerId: 'c-1', totalCents: 2000 }]);
  });

  it('presents a CustomerNotFoundError and persists nothing', async () => {
    customerLookup.exists.mockResolvedValue(false);
    await interactor.execute({ customerId: 'ghost', lines });
    expect(outputPort.presentError).toHaveBeenCalledWith(expect.any(CustomerNotFoundError));
    expect(outputPort.present).not.toHaveBeenCalled();
    expect(await repository.findAll()).toHaveLength(0);
    expect(events.published).toEqual([]); // no event for an order that was not placed
  });

  it('rejects a malformed order before asking the customers module', async () => {
    await interactor.execute({ customerId: '', lines });
    expect(outputPort.presentError).toHaveBeenCalledWith(expect.any(InvalidOrderError));
    expect(customerLookup.exists).not.toHaveBeenCalled();
  });

  it('rethrows an unexpected failure instead of presenting it', async () => {
    const boom = new Error('SQLITE_BUSY: database is locked');
    vi.spyOn(repository, 'save').mockRejectedValue(boom);
    await expect(interactor.execute({ customerId: 'c-1', lines })).rejects.toBe(boom);
    expect(outputPort.present).not.toHaveBeenCalled();
    expect(outputPort.presentError).not.toHaveBeenCalled();
  });

  it('presents an InvalidOrderError for an order without lines', async () => {
    await interactor.execute({ customerId: 'c-1', lines: [] });
    expect(outputPort.presentError).toHaveBeenCalledWith(expect.any(InvalidOrderError));
    expect(await repository.findAll()).toHaveLength(0);
  });
});
