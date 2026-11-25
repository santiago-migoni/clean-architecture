// An APPLICATION failure: another customer already uses this email. It is part of the contract of
// ICustomerRepository.save, so the gateway can raise it without leaking persistence details.
export class EmailAlreadyRegisteredError extends Error {
  constructor(public readonly email: string) {
    super(`Email ${email} is already registered`);
    this.name = 'EmailAlreadyRegisteredError';
  }
}
