from shop.shared.domain_error import DomainError


class InvalidCustomerError(DomainError):
    """A rule of the Customer entity was violated."""
