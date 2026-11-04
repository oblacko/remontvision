"""Парсер YML-фидов (Pampadu и совместимые) → канонические офферы."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from urllib.parse import parse_qs, unquote, urljoin, urlparse

from . import categories


@dataclass
class ParsedOffer:
    external_id: str
    merchant: str | None
    category: str | None
    category_raw: str | None
    name: str
    vendor: str | None
    model: str | None
    description: str | None
    price: float | None
    old_price: float | None
    currency: str
    availability: str
    picture_url: str | None
    canonical_url: str | None
    affiliate_url: str | None
    erid: str | None
    params: dict = field(default_factory=dict)
    raw: dict = field(default_factory=dict)
    supplier_category_id: str | None = None


def _text(node) -> str:
    return (node.text or "").strip() if node is not None else ""


def _num(value: str) -> float | None:
    cleaned = re.sub(r"[^\d.,]", "", str(value or "")).replace(",", ".")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _abs(url: str, source_url: str) -> str | None:
    value = str(url or "").strip()
    if not value:
        return None
    if value.startswith("//"):
        return "https:" + value
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if source_url:
        try:
            return urljoin(source_url, value)
        except ValueError:
            return None
    return None


def decode_target_url(affiliate_url: str) -> tuple[str | None, str | None]:
    """Из CPA-редиректа вытаскивает canonical (`dl`) и `erid`.

    Для обычной ссылки canonical = сама ссылка, erid = query-параметр или None.
    """
    raw = str(affiliate_url or "").strip()
    if not raw:
        return None, None
    try:
        parsed = urlparse(raw)
    except ValueError:
        return raw, None
    query = parse_qs(parsed.query)
    erid = (query.get("erid") or [None])[0]
    dl = (query.get("dl") or [None])[0]
    canonical = unquote(dl) if dl else raw
    return canonical, erid


def _merchant_from_url(url: str | None, fallback: str | None) -> str | None:
    if fallback:
        return fallback
    if not url:
        return None
    try:
        host = urlparse(url).hostname or ""
    except ValueError:
        return None
    return host.lower().removeprefix("www.") or None


def _category_paths(names: dict[str, str], parent: dict[str, str | None]):
    cache: dict[str, list[str]] = {}

    def path_of(cat_id: str) -> list[str]:
        if cat_id in cache:
            return cache[cat_id]
        chain: list[str] = []
        seen: set[str] = set()
        current = cat_id
        while current and current not in seen:
            seen.add(current)
            chain.append(names.get(current, current))
            current = parent.get(current)
        chain.reverse()
        cache[cat_id] = chain
        return chain

    return path_of


def parse_categories(xml_bytes: bytes, feed_id: int) -> list[dict]:
    """Дерево категорий поставщика: id, parent, путь, внутренняя категория."""
    if not xml_bytes:
        return []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []
    names: dict[str, str] = {}
    parent: dict[str, str | None] = {}
    for category in root.iter("category"):
        cat_id = category.get("id")
        if not cat_id:
            continue
        names[cat_id] = (category.text or "").strip()
        parent[cat_id] = category.get("parentId")
    path_of = _category_paths(names, parent)
    rows = []
    for cat_id, name in names.items():
        path = " > ".join(path_of(cat_id))
        rows.append(
            {
                "feed_id": feed_id,
                "external_id": cat_id,
                "name": name,
                "parent_external_id": parent.get(cat_id),
                "path": path,
                "internal_category": categories.map_category_path(path, name),
            }
        )
    return rows


def parse_yml(
    xml_bytes: bytes,
    *,
    source_url: str = "",
    merchant: str | None = None,
    root_category_id: str | None = None,
) -> list[ParsedOffer]:
    """Разбирает YML. Пустой/битый фид → пустой список, без исключения."""
    if not xml_bytes:
        return []
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []

    categories_by_id: dict[str, str] = {}
    parent_by_id: dict[str, str | None] = {}
    children_by_parent: dict[str, list[str]] = {}
    for category in root.iter("category"):
        cat_id = category.get("id")
        if not cat_id:
            continue
        categories_by_id[cat_id] = (category.text or "").strip()
        parent = category.get("parentId")
        parent_by_id[cat_id] = parent
        if parent:
            children_by_parent.setdefault(parent, []).append(cat_id)
    path_of = _category_paths(categories_by_id, parent_by_id)

    allowed: set[str] | None = None
    if root_category_id:
        allowed = set()
        stack = [str(root_category_id)]
        while stack:
            current = stack.pop()
            if current in allowed:
                continue
            allowed.add(current)
            stack.extend(children_by_parent.get(current, []))

    offers: list[ParsedOffer] = []
    for node in root.iter("offer"):
        external_id = (node.get("id") or "").strip()
        if not external_id:
            continue
        category_id = _text(node.find("categoryId"))
        if allowed is not None and category_id not in allowed:
            continue
        name = _text(node.find("name"))
        category_raw = categories_by_id.get(category_id)
        category_path = " > ".join(path_of(category_id)) if category_id else ""
        affiliate_url = _text(node.find("url")) or None
        canonical_url, erid = (
            decode_target_url(affiliate_url) if affiliate_url else (None, None)
        )
        canonical_url = canonical_url or affiliate_url
        picture_url = _abs(_text(node.find("picture")), source_url)
        params: dict[str, str] = {}
        for param in node.findall("param"):
            key = (param.get("name") or "").strip()
            if key:
                params[key] = _text(param)

        available = (node.get("available") or "").strip().lower()
        availability = (
            "in_stock" if available in ("true", "1", "yes") else "out_of_stock"
        )

        price = _num(_text(node.find("price")))
        old_price = _num(_text(node.find("oldprice")))

        offers.append(
            ParsedOffer(
                external_id=external_id,
                merchant=_merchant_from_url(canonical_url, merchant),
                category=categories.map_category_path(category_path, name),
                category_raw=category_raw,
                supplier_category_id=category_id or None,
                name=name,
                vendor=_text(node.find("vendor")) or None,
                model=_text(node.find("model")) or None,
                description=_text(node.find("description")) or None,
                price=price,
                old_price=old_price,
                currency=(_text(node.find("currencyId")) or "RUB").upper(),
                availability=availability,
                picture_url=picture_url,
                canonical_url=canonical_url,
                affiliate_url=affiliate_url,
                erid=erid,
                params=params,
                raw={
                    "id": external_id,
                    "categoryId": category_id,
                    "categoryPath": category_path,
                    "available": available,
                    "price": _text(node.find("price")),
                    "oldprice": _text(node.find("oldprice")),
                    "url": affiliate_url,
                    "picture": _text(node.find("picture")),
                    "name": name,
                    "params": params,
                },
            )
        )
    return offers
