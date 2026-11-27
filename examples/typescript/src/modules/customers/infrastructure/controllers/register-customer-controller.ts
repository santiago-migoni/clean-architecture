// Layer: infrastructure. Default style (no Output Port): maps the response model to HTTP itself.
import type { Request, Response } from 'express';
import { RegisterCustomerInteractor } from '../../application/interactors/register-customer';
import { EmailAlreadyRegisteredError } from '../../application/errors/email-already-registered-error';
import { InvalidCustomerError } from '../../domain/errors/invalid-customer-error';
import type { RegisterCustomerHttpRequest } from './register-customer-http-request';

export class RegisterCustomerController {
  constructor(private readonly useCase: RegisterCustomerInteractor) {}

  async handle(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Partial<RegisterCustomerHttpRequest>;
    try {
      const response = await this.useCase.execute({ name: String(body.name ?? ''), email: String(body.email ?? '') });
      res.status(201).json(response);
    } catch (error) {
      // Known domain failures → delivery-specific answer. Mapping happens HERE, never inside the use case.
      if (error instanceof InvalidCustomerError) {
        res.status(400).json({ message: error.message });
        return;
      }
      if (error instanceof EmailAlreadyRegisteredError) {
        res.status(409).json({ message: error.message });
        return;
      }
      throw error; // unexpected → Express error handler (500); never swallow it
    }
  }
}
