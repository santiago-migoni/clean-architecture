// src/modules/orders/app/ports/output/customer-lookup.ts
// A port owned by `orders`, expressed in orders' vocabulary. It is implemented in orders/infra
// by calling the customers module's INPUT port — never by importing customers' domain or infra.
export interface ICustomerLookup {
  exists(customerId: string): Promise<boolean>;
}
