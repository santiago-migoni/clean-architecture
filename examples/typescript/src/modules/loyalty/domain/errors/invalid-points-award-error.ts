// A rule of the PointsAward entity was violated. `reason` is the stable code; the message is for logs.
import { DomainError } from '../../../../shared/domain-error';

export type InvalidPointsAwardReason = 'ORDER_REQUIRED' | 'CUSTOMER_REQUIRED' | 'INVALID_TOTAL';

export class InvalidPointsAwardError extends DomainError {
  constructor(readonly reason: InvalidPointsAwardReason, message: string) {
    super(message);
  }
}
