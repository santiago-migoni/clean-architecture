"""Where loyalty keeps its awards. One award per order, so an event delivered twice counts once."""
from typing import Protocol

from ....domain.points_award import PointsAward


class AwardRepository(Protocol):
    def add(self, award: PointsAward) -> bool:
        """Stores the award; False (and nothing changes) when the order already has one."""
        ...

    def points_of(self, customer_id: str) -> int: ...
