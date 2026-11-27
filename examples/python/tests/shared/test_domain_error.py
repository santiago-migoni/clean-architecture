"""The shared kernel is tested on its own: no module is imported here."""
from shop.shared.domain_error import DomainError


class InvalidThing(DomainError):
    pass


def test_any_broken_business_rule_can_be_caught_with_one_type():
    error = InvalidThing("a rule was broken")
    assert isinstance(error, DomainError)
    assert str(error) == "a rule was broken"
