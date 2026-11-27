// Layer: infrastructure. Default style (no Output Port): maps the response model to HTTP itself.
import type { Request, Response } from 'express';
import { RegisterCustomerInteractor } from '../../application/interactors/register-customer';
import { EmailAlreadyRegisteredError } from '../../application/errors/email-already-registered-error';
import { InvalidCustomerError } from '../../domain/errors/invalid-customer-error';
import type { Translate } from './customer-messages';
import type { RegisterCustomerHttpRequest } from './register-customer-http-request';

export class RegisterCustomerController {
  constructor(private readonly useCase: RegisterCustomerInteractor, private readonly t: Translate) {}

  async handle(req: Request, res: Response, locale: string): Promise<void> {
    const body = (req.body ?? {}) as Partial<RegisterCustomerHttpRequest>;
    try {
      const response = await this.useCase.execute({ name: String(body.name ?? ''), email: String(body.email ?? '') });
      res.status(201).json(response);
    } catch (error) {
      // Known failures → a code and a text in the request's language. Mapping happens HERE, never in the use case,
      // and by the error's type and reason, never by its message (which is for logs).
      if (error instanceof InvalidCustomerError) {
        res.status(400).json({ code: 'INVALID_CUSTOMER', message: this.t(locale, `INVALID_CUSTOMER.${error.reason}`) });
        return;
      }
      if (error instanceof EmailAlreadyRegisteredError) {
        res.status(409).json({ code: 'EMAIL_ALREADY_REGISTERED', message: this.t(locale, 'EMAIL_ALREADY_REGISTERED', { email: error.email }) });
        return;
      }
      throw error; // unexpected → Express error handler (500); never swallow it
    }
  }
}
