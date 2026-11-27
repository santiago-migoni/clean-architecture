"""The common base of the errors that mean "a business rule was violated".

Each module still declares its own error (InvalidOrderError, InvalidCustomerError); outer layers can catch
the base or the specific one.
"""


class DomainError(ValueError):
    pass
