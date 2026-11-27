// Layer: infrastructure. Depends on the Input Port (an interface) because other modules also call this use case.
import type { Request, Response } from 'express';
import { IGetCustomerUseCase } from '../../application/ports/input/get-customer';
import type { Translate } from './customer-messages';

export class GetCustomerController {
  constructor(private readonly useCase: IGetCustomerUseCase, private readonly t: Translate) {}

  async handle(req: Request, res: Response, locale: string): Promise<void> {
    const customerId = String(req.params.id);
    const response = await this.useCase.execute({ customerId });
    if (response === null) {
      res.status(404).json({ code: 'CUSTOMER_NOT_FOUND', message: this.t(locale, 'CUSTOMER_NOT_FOUND', { customerId }) });
      return;
    }
    res.status(200).json(response);
  }
}
