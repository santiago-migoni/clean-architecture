// Layer: infrastructure. Default style: maps the response model to HTTP itself. It never fails for a known reason
// (an unknown customer has 0 points), so it has no texts to translate.
import type { Request, Response } from 'express';
import type { GetPointsInteractor } from '../../application/interactors/get-points';

export class GetPointsController {
  constructor(private readonly useCase: GetPointsInteractor) {}

  async handle(req: Request, res: Response): Promise<void> {
    res.status(200).json(await this.useCase.execute({ customerId: String(req.params.customerId) }));
  }
}
