// src/modules/customers/app/ports/input/get-customer.ts
// PUBLIC SURFACE of the customers module: the only thing another module's infra may import.
// Plain data only — no domain objects cross this boundary.

export interface GetCustomerRequest {
  customerId: string;
}

export interface GetCustomerResponse {
  id: string;
  name: string;
  email: string;
}

export interface IGetCustomerUseCase {
  /** Resolves to null when the customer does not exist. */
  execute(request: GetCustomerRequest): Promise<GetCustomerResponse | null>;
}
