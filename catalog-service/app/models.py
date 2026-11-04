"""Модели данных каталога."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Feed:
    name: str
    url: str
    id: int | None = None
    format: str = "yml"
    adapter: str = "pampadu_yml"
    active: bool = True
    last_synced_at: str | None = None
    offer_count: int = 0
    error: str | None = None
    root_category_id: str | None = None


@dataclass
class Offer:
    feed_id: int
    external_id: str
    name: str
    id: str | None = None
    merchant: str | None = None
    category: str | None = None
    category_raw: str | None = None
    vendor: str | None = None
    model: str | None = None
    description: str | None = None
    price: float | None = None
    old_price: float | None = None
    currency: str = "RUB"
    availability: str = "unknown"
    picture_url: str | None = None
    picture_path: str | None = None
    canonical_url: str | None = None
    affiliate_url: str | None = None
    erid: str | None = None
    params: dict = field(default_factory=dict)
    raw: dict = field(default_factory=dict)
    status: str = "active"
    content_hash: str | None = None
    color_hist: list[float] | None = None
    supplier_category_id: str | None = None
