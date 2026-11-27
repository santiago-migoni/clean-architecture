"""The HTTP body exactly as it arrives."""
from typing import TypedDict


class RegisterCustomerHttpRequest(TypedDict, total=False):
    name: str
    email: str
