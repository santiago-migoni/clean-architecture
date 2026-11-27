"""The same HTTP scenarios against the PRODUCTION composition root (real SQLite) and the TEST one (in-memory)."""
import pytest
from fastapi.testclient import TestClient

from shop.main.app import create_app
from shop.main.testing import create_test_app


@pytest.fixture(params=["production", "in-memory"])
def client(request):
    app = create_app(":memory:", audit_log=lambda line: None) if request.param == "production" else create_test_app().app
    return TestClient(app, raise_server_exceptions=False)


def register(client, email="ada@example.com"):
    return client.post("/customers", json={"name": "Ada", "email": email})


def test_registers_a_customer_reads_it_back_and_404s_on_an_unknown_one(client):
    created = register(client, "ADA@example.com")
    assert created.status_code == 201
    found = client.get(f"/customers/{created.json()['customerId']}")
    assert found.status_code == 200 and found.json()["email"] == "ada@example.com"
    assert client.get("/customers/ghost").status_code == 404


def test_a_duplicate_email_is_409_and_the_first_customer_survives(client):
    first = register(client).json()["customerId"]
    second = register(client)
    assert second.status_code == 409
    assert second.json() == {"code": "EMAIL_ALREADY_REGISTERED", "message": "Email ada@example.com is already registered"}
    assert client.get(f"/customers/{first}").status_code == 200


def test_an_invalid_customer_is_400(client):
    response = client.post("/customers", json={"name": "Ada", "email": "nope"})
    assert response.status_code == 400 and response.json() == {"code": "INVALID_CUSTOMER", "message": "Customer email is not valid"}


def test_places_an_order_formatted_by_the_presenter(client):
    customer_id = register(client).json()["customerId"]
    items = [{"productId": "p1", "quantity": 3, "unitPriceCents": 250}, {"productId": "p2", "quantity": 1, "unitPriceCents": 1000}]
    response = client.post("/orders", json={"customerId": customer_id, "items": items})
    assert response.status_code == 201
    assert response.json()["statusLabel"] == "Pending" and response.json()["total"] == "$17.50"


def test_presenter_error_codes_become_http_statuses(client):
    customer_id = register(client).json()["customerId"]
    unknown = client.post("/orders", json={"customerId": "ghost", "items": [{"productId": "p1", "quantity": 1, "unitPriceCents": 1}]})
    assert unknown.status_code == 404 and unknown.json() == {"code": "CUSTOMER_NOT_FOUND", "message": "Customer ghost not found"}
    empty = client.post("/orders", json={"customerId": customer_id, "items": []})
    assert empty.status_code == 400 and empty.json()["code"] == "INVALID_ORDER"


def test_answers_in_the_language_of_accept_language_and_in_english_when_it_is_not_spoken(client):
    es = {"accept-language": "es-AR,es;q=0.9,en;q=0.5"}
    customer_id = register(client).json()["customerId"]
    invalid = client.post("/customers", json={"name": "Ada", "email": "nope"}, headers=es)
    assert (invalid.status_code, invalid.json()) == (400, {"code": "INVALID_CUSTOMER", "message": "El email del cliente no es válido"})
    missing = client.get("/customers/ghost", headers=es)
    assert (missing.status_code, missing.json()) == (404, {"code": "CUSTOMER_NOT_FOUND", "message": "No existe el cliente ghost"})
    empty = client.post("/orders", json={"customerId": customer_id, "items": []}, headers=es)
    assert (empty.status_code, empty.json()) == (400, {"code": "INVALID_ORDER", "message": "El pedido debe tener al menos una línea"})
    placed = client.post("/orders", json={"customerId": customer_id, "items": [{"productId": "p1", "quantity": 1, "unitPriceCents": 250}]}, headers=es)
    assert placed.status_code == 201 and (placed.json()["statusLabel"], placed.json()["total"]) == ("Pendiente", "$2.50")
    malformed = client.post("/orders", content=b"{", headers={"content-type": "application/json", **es})
    assert (malformed.status_code, malformed.json()) == (400, {"code": "MALFORMED_JSON", "message": "JSON mal formado"})
    french = client.get("/customers/ghost", headers={"accept-language": "fr-FR,de;q=0.8"})
    assert french.json()["message"] == "Customer ghost not found"


def test_malformed_json_is_400_not_500(client):
    response = client.post("/orders", content=b"{", headers={"content-type": "application/json"})
    assert response.status_code == 400 and response.json() == {"code": "MALFORMED_JSON", "message": "Malformed JSON"}
