"""Конфигурация сервиса из переменных окружения."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class Settings:
    database_url: str
    catalog_token: str
    embedder: str
    embed_model: str
    embed_dim: int
    embed_concurrency: int
    color_rerank_weight: float
    color_rerank_pool: int
    attr_rerank_weight: float
    max_feed_bytes: int
    http_timeout_s: float


def get_settings() -> Settings:
    database_url = (
        os.environ.get("CATALOG_DATABASE_URL")
        or os.environ.get("RV_CATALOG_DATABASE_URL")
        or ""
    )
    return Settings(
        database_url=database_url,
        catalog_token=os.environ.get("CATALOG_SERVICE_TOKEN", ""),
        embedder=os.environ.get("EMBEDDER", "fake"),
        embed_model=os.environ.get("EMBED_MODEL", "vit_base_patch14_dinov2.lvd142m"),
        embed_dim=_int("EMBED_DIM", 768),
        embed_concurrency=_int("EMBED_CONCURRENCY", 16),
        color_rerank_weight=_float("COLOR_RERANK_WEIGHT", 0.3),
        color_rerank_pool=_int("COLOR_RERANK_POOL", 100),
        attr_rerank_weight=_float("ATTR_RERANK_WEIGHT", 0.25),
        max_feed_bytes=_int("MAX_FEED_BYTES", 300_000_000),
        http_timeout_s=_float("HTTP_TIMEOUT_S", 30.0),
    )
