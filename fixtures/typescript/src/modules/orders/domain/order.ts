// Enterprise business rules of the orders module. Customers are referenced by id only.
export class InvalidOrderError extends Error {}

export class Order {
  constructor(
    readonly id: string,
    readonly customerId: string,
    readonly quantity: number,
  ) {
    if (quantity <= 0) throw new InvalidOrderError('quantity must be positive');
  }
}
