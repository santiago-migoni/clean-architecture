// src/modules/orders/application/ports/published/order-placed-v1.ts
// A PUBLISHED CONTRACT (integration event): what `orders` announces to other modules. Part of the module's public
// surface, like application/ports/input. Plain, versioned data: it imports nothing, so a subscriber depends on this
// file only, never on orders' domain. A change that breaks a subscriber is a new version (v2), published beside v1.
export const ORDER_PLACED_V1 = 'orders.order-placed.v1';

export interface OrderPlacedV1 {
  readonly type: typeof ORDER_PLACED_V1;
  readonly orderId: string;
  readonly customerId: string;
  readonly totalCents: number;
}
