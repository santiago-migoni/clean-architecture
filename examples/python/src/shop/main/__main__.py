"""Entry point: python -m shop.main. Reads the configuration, builds the app and serves it. Nothing else.

The only module of the project that touches os.environ.
"""
import os

import uvicorn

from shop.main.app import create_app
from shop.main.config import load_config

if __name__ == "__main__":
    config = load_config(os.environ)  # a wrong setting stops here, before anything starts
    uvicorn.run(create_app(config.db_path), host="127.0.0.1", port=config.port)
