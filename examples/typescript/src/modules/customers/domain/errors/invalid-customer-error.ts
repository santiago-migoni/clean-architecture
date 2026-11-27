// A rule of the Customer entity was violated. Thrown by the entity, mapped by the outer layers.
import { DomainError } from '../../../../shared/domain-error';

export class InvalidCustomerError extends DomainError {}
