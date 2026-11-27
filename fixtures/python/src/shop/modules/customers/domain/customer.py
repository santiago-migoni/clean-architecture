"""Enterprise business rules of the customers module."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Customer:
    id: str
    name: str
