"""Composition of the loyalty module. It needs nothing from another module: it only REACTS to orders' event, and main
subscribes its subscriber."""
from dataclasses import dataclass
from pathlib import Path

import shop.modules.loyalty.infrastructure.gateways as loyalty_gateways
from shop.modules.loyalty.application.interactors.award_points import AwardPointsInteractor
from shop.modules.loyalty.application.interactors.get_points import GetPointsInteractor
from shop.modules.loyalty.application.ports.output.award_repository import AwardRepository
from shop.modules.loyalty.infrastructure.controllers.get_points_controller import GetPointsController
from shop.modules.loyalty.infrastructure.subscribers.order_placed_subscriber import OrderPlacedSubscriber
from shop.platform.db.migrate import Migration

MIGRATIONS = [
    Migration(f"loyalty/{p.stem}", p.read_text())
    for p in sorted((Path(loyalty_gateways.__file__).parent / "migrations").glob("*.sql"))
]


@dataclass(frozen=True)
class LoyaltyModule:
    order_placed: OrderPlacedSubscriber
    get_points: GetPointsController


def compose_loyalty(awards: AwardRepository) -> LoyaltyModule:
    return LoyaltyModule(
        order_placed=OrderPlacedSubscriber(AwardPointsInteractor(awards)),
        get_points=GetPointsController(GetPointsInteractor(awards)),
    )
