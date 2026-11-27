from shop.shared.domain_error import DomainError


class InvalidOrderError(DomainError):
    """A rule of the Order aggregate was violated."""
