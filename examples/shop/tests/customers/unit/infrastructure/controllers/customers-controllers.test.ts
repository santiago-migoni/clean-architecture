import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { RegisterCustomerController } from '@/modules/customers/infrastructure/controllers/register-customer-controller';
import { GetCustomerController } from '@/modules/customers/infrastructure/controllers/get-customer-controller';
import { InvalidCustomerError } from '@/modules/customers/domain/errors/invalid-customer-error';
import { EmailAlreadyRegisteredError } from '@/modules/customers/application/errors/email-already-registered-error';

const fakeRes = () => { const r = { status: vi.fn(), json: vi.fn() }; r.status.mockReturnValue(r); return r; };

describe('RegisterCustomerController', () => {
  it('maps the response model to 201', async () => {
    const useCase = { execute: vi.fn().mockResolvedValue({ customerId: 'c-1' }) };
    const res = fakeRes();
    await new RegisterCustomerController(useCase as never).handle({ body: { name: 'Ada', email: 'a@b.co' } } as Request, res as unknown as Response);
    expect(useCase.execute).toHaveBeenCalledWith({ name: 'Ada', email: 'a@b.co' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ customerId: 'c-1' });
  });

  it('maps a domain failure to 400', async () => {
    const useCase = { execute: vi.fn().mockRejectedValue(new InvalidCustomerError('Customer email is not valid')) };
    const res = fakeRes();
    await new RegisterCustomerController(useCase as never).handle({ body: {} } as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('maps an already-registered email to 409', async () => {
    const useCase = { execute: vi.fn().mockRejectedValue(new EmailAlreadyRegisteredError('a@b.co')) };
    const res = fakeRes();
    await new RegisterCustomerController(useCase as never).handle({ body: {} } as Request, res as unknown as Response);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('rethrows an unexpected error instead of swallowing it', async () => {
    const useCase = { execute: vi.fn().mockRejectedValue(new Error('boom')) };
    await expect(new RegisterCustomerController(useCase as never).handle({ body: {} } as Request, fakeRes() as unknown as Response)).rejects.toThrow('boom');
  });
});

describe('GetCustomerController (depends on the Input Port)', () => {
  it('returns 200 with the customer, 404 when it does not exist', async () => {
    const useCase = { execute: vi.fn().mockResolvedValueOnce({ id: 'c-1', name: 'Ada', email: 'a@b.co' }).mockResolvedValueOnce(null) };
    const controller = new GetCustomerController(useCase);
    const ok = fakeRes(); const missing = fakeRes();
    await controller.handle({ params: { id: 'c-1' } } as unknown as Request, ok as unknown as Response);
    await controller.handle({ params: { id: 'ghost' } } as unknown as Request, missing as unknown as Response);
    expect(ok.status).toHaveBeenCalledWith(200);
    expect(missing.status).toHaveBeenCalledWith(404);
  });
});
