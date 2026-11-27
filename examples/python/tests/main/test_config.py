"""The configuration is a pure function of the environment it is given: no os.environ here."""
import pytest

from shop.main.config import AppConfig, ConfigError, load_config


def test_uses_the_defaults_when_nothing_is_set():
    assert load_config({}) == AppConfig(db_path=":memory:", port=8000)


def test_reads_db_path_and_port():
    assert load_config({"DB_PATH": "shop.db", "PORT": "8081"}) == AppConfig(db_path="shop.db", port=8081)


def test_treats_an_empty_value_as_unset():
    assert load_config({"DB_PATH": " ", "PORT": ""}) == AppConfig(db_path=":memory:", port=8000)


@pytest.mark.parametrize("port", ["abc", "0", "65536", "-1", "80.5", "1e3"])
def test_stops_at_startup_on_a_bad_port_naming_the_setting(port):
    with pytest.raises(ConfigError, match="PORT"):
        load_config({"PORT": port})
