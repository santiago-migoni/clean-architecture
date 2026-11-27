// PUBLIC SURFACE of the customers module: the only thing another module's infrastructure may import.
export interface CustomerView {
  id: string;
  name: string;
}

export interface GetCustomer {
  execute(customerId: string): Promise<CustomerView | null>;
}
