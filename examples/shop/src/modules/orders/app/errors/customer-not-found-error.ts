// An APPLICATION failure (not an enterprise rule): the use case needs a customer that does not exist.
export class CustomerNotFoundError extends Error {
  constructor(public readonly customerId: string) {
    super(`Customer ${customerId} not found`);
    this.name = 'CustomerNotFoundError';
  }
}
