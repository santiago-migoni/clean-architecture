// A rule of the Order aggregate was violated. Thrown by the entity, mapped by the outer layers.
import { DomainError } from '../../../../shared/domain-error';

export class InvalidOrderError extends DomainError {}
