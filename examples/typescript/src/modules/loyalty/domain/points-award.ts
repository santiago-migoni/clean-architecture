// src/modules/loyalty/domain/points-award.ts
// Layer: domain. Dependencies: at most src/shared/.
// The points a customer earned for one order. The order and the customer belong to other modules: they are
// referenced by id only, and loyalty keeps its own copy of the one number it needs (the total).
import { InvalidPointsAwardError } from './errors/invalid-points-award-error';

export interface PointsAwardProps {
  orderId: string;
  customerId: string;
  points: number;
}

export class PointsAward {
  private constructor(private readonly props: PointsAwardProps) {
    if (props.orderId.trim() === '') throw new InvalidPointsAwardError('ORDER_REQUIRED', 'An award must reference an order');
    if (props.customerId.trim() === '') throw new InvalidPointsAwardError('CUSTOMER_REQUIRED', 'An award must reference a customer');
    if (!Number.isInteger(props.points) || props.points < 0) throw new InvalidPointsAwardError('INVALID_TOTAL', 'Points must be a non-negative integer');
  }

  // Critical Business Rule: one point per whole dollar spent.
  static forOrder(orderId: string, customerId: string, totalCents: number): PointsAward {
    if (!Number.isInteger(totalCents) || totalCents < 0) throw new InvalidPointsAwardError('INVALID_TOTAL', 'An order total must be a non-negative integer (cents)');
    return new PointsAward({ orderId, customerId, points: Math.floor(totalCents / 100) });
  }

  static reconstitute(props: PointsAwardProps): PointsAward {
    return new PointsAward(props);
  }

  get orderId(): string { return this.props.orderId; }
  get customerId(): string { return this.props.customerId; }
  get points(): number { return this.props.points; }
}
