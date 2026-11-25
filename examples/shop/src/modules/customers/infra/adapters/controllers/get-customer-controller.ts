// Layer: infra. Depends on the Input Port (an interface) because other modules also call this use case.
import type { Request, Response } from 'express';
import { IGetCustomerUseCase } from '../../../app/ports/input/get-customer';

export class GetCustomerController {
  constructor(private readonly useCase: IGetCustomerUseCase) {}

  async handle(req: Request, res: Response): Promise<void> {
    const customerId = String(req.params.id);
    const response = await this.useCase.execute({ customerId });
    if (response === null) {
      res.status(404).json({ message: `Customer ${customerId} not found` });
      return;
    }
    res.status(200).json(response);
  }
}
