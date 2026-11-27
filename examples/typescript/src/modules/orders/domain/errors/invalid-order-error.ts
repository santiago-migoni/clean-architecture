// A rule of the Order aggregate was violated. Thrown by the entity, mapped by the outer layers.
// `reason` is the stable code the outer layers translate for users; `message` is for logs, in English.
import { DomainError } from '../../../../shared/domain-error';

export type InvalidOrderReason = 'CUSTOMER_REQUIRED' | 'NO_LINES' | 'PRODUCT_REQUIRED' | 'INVALID_QUANTITY' | 'INVALID_UNIT_PRICE';

export class InvalidOrderError extends DomainError {
  constructor(readonly reason: InvalidOrderReason, message: string) {
    super(message);
  }
}
