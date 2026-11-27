// A rule of the Customer entity was violated. Thrown by the entity, mapped by the outer layers.
// `reason` is the stable code the outer layers translate for users; `message` is for logs, in English.
import { DomainError } from '../../../../shared/domain-error';

export type InvalidCustomerReason = 'NAME_REQUIRED' | 'INVALID_EMAIL';

export class InvalidCustomerError extends DomainError {
  constructor(readonly reason: InvalidCustomerReason, message: string) {
    super(message);
  }
}
