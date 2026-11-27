"""Composition of the customers module."""
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import shop.modules.customers.infrastructure.gateways as customers_gateways
from shop.modules.customers.application.interactors.get_customer import GetCustomerInteractor
from shop.modules.customers.application.interactors.register_customer import RegisterCustomerInteractor
from shop.modules.customers.application.ports.input.get_customer import GetCustomer
from shop.modules.customers.infrastructure.controllers.customer_messages import CUSTOMER_MESSAGES
from shop.modules.customers.infrastructure.controllers.get_customer_controller import GetCustomerController
from shop.modules.customers.infrastructure.controllers.register_customer_controller import RegisterCustomerController
from shop.modules.customers.infrastructure.gateways.sql_customer_repository import SqlCustomerRepository
from shop.platform.db.migrate import Migration
from shop.platform.i18n.translator import create_translator

MIGRATIONS = [
    Migration(f"customers/{p.stem}", p.read_text())
    for p in sorted((Path(customers_gateways.__file__).parent / "migrations").glob("*.sql"))
]


@dataclass(frozen=True)
class CustomersModule:
    get_customer: GetCustomer  # the input port other modules may use
    register_controller: RegisterCustomerController
    get_controller: GetCustomerController


def compose_customers(db: sqlite3.Connection, new_id: Callable[[], str], default_locale: str) -> CustomersModule:
    repository = SqlCustomerRepository(db)
    get_customer = GetCustomerInteractor(repository)
    t = create_translator(CUSTOMER_MESSAGES, default_locale)
    return CustomersModule(
        get_customer=get_customer,
        register_controller=RegisterCustomerController(RegisterCustomerInteractor(repository, new_id), t),
        get_controller=GetCustomerController(get_customer, t),
    )
