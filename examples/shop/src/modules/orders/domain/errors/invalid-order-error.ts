// A rule of the Order aggregate was violated. Thrown by the entity, mapped by the outer layers.
export class InvalidOrderError extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidOrderError'; }
}
