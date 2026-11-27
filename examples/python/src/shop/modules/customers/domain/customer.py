"""Enterprise business rules of the customers module. May import only shop.shared."""
from __future__ import annotations

import re
from dataclasses import dataclass

from .errors import InvalidCustomerError

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@dataclass(frozen=True)
class Customer:
    id: str
    name: str
    email: str

    def __post_init__(self) -> None:
        # Runs on create() and reconstitute() alike: stored data must satisfy the same invariants.
        if not self.name:
            raise InvalidCustomerError("NAME_REQUIRED", "Customer name must not be empty")
        if not _EMAIL.match(self.email):
            raise InvalidCustomerError("INVALID_EMAIL", "Customer email is not valid")

    @classmethod
    def create(cls, id: str, name: str, email: str) -> Customer:
        return cls(id=id, name=name.strip(), email=email.strip().lower())

    @classmethod
    def reconstitute(cls, id: str, name: str, email: str) -> Customer:
        return cls(id=id, name=name, email=email)
