// A rule of the Customer entity was violated. Thrown by the entity, mapped by the outer layers.
export class InvalidCustomerError extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidCustomerError'; }
}
