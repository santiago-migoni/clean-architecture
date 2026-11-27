"""PUBLIC SURFACE of the customers module: the only thing another module's infrastructure may import.

Plain data only — no domain objects cross this boundary.
"""
from dataclasses import dataclass
from typing import Optional, Protocol


@dataclass(frozen=True)
class CustomerView:
    id: str
    name: str
    email: str


class GetCustomer(Protocol):
    def execute(self, customer_id: str) -> Optional[CustomerView]: ...
