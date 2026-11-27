// src/modules/orders/application/ports/output/customer-lookup.ts
// A port owned by `orders`, expressed in orders' vocabulary. It is implemented in orders/infrastructure
// by calling the customers module's INPUT port — never by importing customers' domain or infrastructure.
export interface ICustomerLookup {
  exists(customerId: string): Promise<boolean>;
}
