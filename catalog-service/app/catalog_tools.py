"""Инструменты каталога для MCP-сервера и vision-агента."""

from __future__ import annotations

import os

import httpx

from . import categories

BASE = os.environ.get("CATALOG_SERVICE_URL", "http://127.0.0.1:8000").rstrip("/")
TOKEN = os.environ.get("CATALOG_SERVICE_TOKEN", "change-me")
DB_DSN = os.environ.get("CATALOG_DATABASE_URL", "")
PARAM_KEYS = ("Цвет", "Материал", "Тип обивки", "Ширина", "Длина", "Высота", "Глубина")


def _headers() -> dict:
    return {"x-catalog-token": TOKEN}


def _compact_params(params: dict | None) -> dict:
    return {
        key: value
        for key, value in (params or {}).items()
        if key in PARAM_KEYS and value
    }


def list_categories() -> list[dict]:
    response = httpx.get(f"{BASE}/categories", headers=_headers(), timeout=30)
    response.raise_for_status()
    return response.json()


def search_offers(
    query: str = "",
    category: str | None = None,
    color: str | None = None,
    material: str | None = None,
    product_type: str | None = None,
    size: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    product = {
        key: value
        for key, value in {
            "color": color,
            "material": material,
            "product_type": product_type,
            "size": size,
            "label": query or None,
        }.items()
        if value
    }
    body = {
        "query": query or "",
        "filters": {"categories": [category]} if category else {},
        "product": product or None,
        "top_k": max(1, min(20, int(top_k or 5))),
    }
    response = httpx.post(
        f"{BASE}/search-text", headers=_headers(), json=body, timeout=180
    )
    response.raise_for_status()
    results = response.json().get("results", [])
    return [
        {
            "offer_id": item.get("offer_id"),
            "name": item.get("name"),
            "category": item.get("category"),
            "price": item.get("price"),
            "availability": item.get("availability"),
            "params": _compact_params(item.get("params")),
            "score": item.get("score"),
        }
        for item in results
    ]


def get_offer(offer_id: str) -> dict:
    response = httpx.get(f"{BASE}/offers/{offer_id}", headers=_headers(), timeout=30)
    response.raise_for_status()
    offer = response.json()
    return {
        "offer_id": offer.get("id"),
        "name": offer.get("name"),
        "category": offer.get("category"),
        "category_raw": offer.get("category_raw"),
        "price": offer.get("price"),
        "currency": offer.get("currency"),
        "availability": offer.get("availability"),
        "picture_url": offer.get("picture_url"),
        "canonical_url": offer.get("canonical_url"),
        "affiliate_url": offer.get("affiliate_url"),
        "erid": offer.get("erid"),
        "params": _compact_params(offer.get("params")),
    }


def category_stats(category: str) -> dict:
    if not DB_DSN:
        return {
            "category": category,
            "count": None,
            "note": "CATALOG_DATABASE_URL не задан",
        }
    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(DB_DSN, row_factory=dict_row) as conn:
        total = conn.execute(
            "SELECT count(*)::int AS count FROM offers WHERE category=%s AND status='active'",
            (category,),
        ).fetchone()
        colors = conn.execute(
            """SELECT params->>'Цвет' AS value, count(*)::int AS n FROM offers
               WHERE category=%s AND params ? 'Цвет' GROUP BY 1 ORDER BY 2 DESC LIMIT 12""",
            (category,),
        ).fetchall()
        materials = conn.execute(
            """SELECT params->>'Материал' AS value, count(*)::int AS n FROM offers
               WHERE category=%s AND params ? 'Материал' GROUP BY 1 ORDER BY 2 DESC LIMIT 12""",
            (category,),
        ).fetchall()
    return {
        "category": category,
        "label": categories.INTERNAL_LABELS.get(category, category),
        "count": total["count"] if total else 0,
        "colors": colors,
        "materials": materials,
    }


def resolve_category(label: str) -> dict:
    key = categories.map_category(label or "", label or "")
    return {"key": key, "label": categories.INTERNAL_LABELS.get(key, key)}


TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "list_categories",
            "description": "Список категорий каталога (ключ и русское название).",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_offers",
            "description": "Поиск реальных товаров в каталоге по категории, ключевым словам и атрибутам.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Ключевые слова (тип, опоры, материал, цвет)",
                    },
                    "category": {
                        "type": "string",
                        "description": "Ключ категории каталога, например bed, sideboard, cabinet",
                    },
                    "color": {"type": "string", "description": "Цвет товара"},
                    "material": {"type": "string", "description": "Материал товара"},
                    "product_type": {
                        "type": "string",
                        "description": "Тип: мягкая, деревянная, металлическая, ...",
                    },
                    "size": {"type": "string", "description": "Размер, если виден"},
                    "top_k": {
                        "type": "integer",
                        "description": "Сколько товаров вернуть (1-20)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "category_stats",
            "description": "Сколько товаров в категории и какие реальные цвета/материалы в ней есть.",
            "parameters": {
                "type": "object",
                "properties": {"category": {"type": "string"}},
                "required": ["category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_offer",
            "description": "Карточка конкретного товара по offer_id.",
            "parameters": {
                "type": "object",
                "properties": {"offer_id": {"type": "string"}},
                "required": ["offer_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "resolve_category",
            "description": "Сопоставить свободное название категории с ключом каталога.",
            "parameters": {
                "type": "object",
                "properties": {"label": {"type": "string"}},
                "required": ["label"],
            },
        },
    },
]


def dispatch(name: str, arguments: dict | None) -> dict | list:
    args = arguments or {}
    if name == "list_categories":
        return list_categories()
    if name == "search_offers":
        return search_offers(
            query=str(args.get("query") or ""),
            category=args.get("category"),
            color=args.get("color"),
            material=args.get("material"),
            product_type=args.get("product_type"),
            size=args.get("size"),
            top_k=int(args.get("top_k") or 5),
        )
    if name == "category_stats":
        return category_stats(str(args.get("category") or ""))
    if name == "get_offer":
        return get_offer(str(args.get("offer_id") or ""))
    if name == "resolve_category":
        return resolve_category(str(args.get("label") or ""))
    raise ValueError(f"Неизвестный инструмент: {name}")
