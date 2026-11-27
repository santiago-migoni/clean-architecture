// Port owned by orders. Implemented in orders/infrastructure by calling the customers INPUT port.
export interface CustomerLookup {
  exists(customerId: string): Promise<boolean>;
}
