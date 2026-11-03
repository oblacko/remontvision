"""Точка входа: uvicorn app.main:app."""

from __future__ import annotations

from .api import create_app
from .config import get_settings

app = create_app(get_settings())
