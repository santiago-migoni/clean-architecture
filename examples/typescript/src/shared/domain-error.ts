// src/shared/domain-error.ts — SHARED KERNEL: imported by every module's domain, imports nothing.
// The common base of the errors that mean "a business rule was violated". Each module still declares its
// own error (InvalidOrderError, InvalidCustomerError); outer layers can map the base or the specific one.
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
