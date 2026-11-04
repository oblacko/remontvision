"""Атрибуты товара: тип (мягкая/деревянная/металл) и семейство цвета + скоринг."""

from __future__ import annotations

import json
import re

# Семейства цветов: ключ → подстроки-синонимы.
COLOR_FAMILIES = [
    (
        "brown",
        [
            "коричнев",
            "мокко",
            "латте",
            "какао",
            "кофе",
            "шоколад",
            "орех",
            "капучино",
            "терракот",
            "карамел",
            "табак",
            "коньяк",
        ],
    ),
    (
        "beige",
        [
            "беж",
            "шампан",
            "кремов",
            "кашемир",
            "песочн",
            "слонов",
            "айвори",
            "светло-беж",
        ],
    ),
    ("gray", ["сер", "графит", "сталь", "асфальт", "антрацит", "дымчат"]),
    ("white", ["бел", "снежн", "молочн", "шагрень"]),
    ("black", ["черн", "уголь"]),
    ("blue", ["син", "голуб", "индиго", "морской", "navy"]),
    ("green", ["зелен", "олив", "фисташк", "изумруд", "шалфей"]),
    ("red", ["красн", "бордо", "винн", "марсала"]),
    ("pink", ["розов", "пудр"]),
    ("yellow", ["желт", "горчич", "медов"]),
    ("orange", ["оранж"]),
    ("purple", ["фиолет", "лаванд", "сирен"]),
]

SOFT_WORDS = [
    "велюр",
    "рогожк",
    "шенилл",
    "замш",
    "экокож",
    "обивк",
    "мягк",
    "ткан",
    "букле",
    "букл",
    "плюш",
    "флок",
]
WOOD_WORDS = [
    "лдсп",
    "дсп",
    "мдф",
    "дерев",
    "дуб",
    "массив",
    "фанер",
    "ясен",
    "орех",
    "сосн",
    "береза",
    "берёза",
    "шпон",
]
METAL_WORDS = ["металл", "сталь", "алюмин", "желез", "латун", "хром"]
STONE_WORDS = ["камен", "кварц", "мрамор", "гранит", "керамогранит"]
GLASS_WORDS = ["стекл", "зеркал"]

STOPWORDS = {
    "для",
    "или",
    "при",
    "как",
    "что",
    "это",
    "под",
    "над",
    "без",
    "из",
    "на",
    "в",
    "с",
    "и",
    "по",
    "от",
    "до",
    "the",
    "and",
}


def _norm(value) -> str:
    text = str(value or "").lower().replace("ё", "е")
    text = re.sub(r"[^0-9a-zа-я]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


_ENDINGS = (
    "ыми",
    "ими",
    "ого",
    "его",
    "ому",
    "ему",
    "ая",
    "яя",
    "ое",
    "ее",
    "ые",
    "ие",
    "ый",
    "ий",
    "ой",
    "ей",
    "ую",
    "юю",
    "ам",
    "ям",
    "ах",
    "ях",
    "ов",
    "ев",
    "ы",
    "и",
    "а",
    "я",
    "о",
    "е",
    "у",
    "ю",
    "ь",
)


def stem(token: str) -> str:
    """Грубый русский стеммер: «кухонные»→«кухонн», «шкафы»→«шкаф»."""
    token = str(token or "").lower()
    for ending in _ENDINGS:
        if token.endswith(ending) and len(token) - len(ending) >= 4:
            return token[: -len(ending)]
    return token


def _tokens(value) -> set[str]:
    return {
        token
        for token in _norm(value).split()
        if len(token) >= 3 and token not in STOPWORDS
    }


def _keywords(value) -> set[str]:
    return {token for token in _tokens(value) if len(token) >= 3}


def _params_text(params: dict) -> str:
    return _norm(" ".join(str(v) for v in (params or {}).values() if v))


def _first_family(text: str) -> str | None:
    normalized = _norm(text)
    if not normalized:
        return None
    for family, words in COLOR_FAMILIES:
        if any(word in normalized for word in words):
            return family
    return None


def color_family(value) -> str | None:
    return _first_family(value)


def offer_color_family(offer) -> str | None:
    params = offer.params or {}
    for key in ("Цвет", "Цвет каркаса", "Цвет обивки", "Основной цвет"):
        value = params.get(key)
        if value:
            family = _first_family(value)
            if family:
                return family
    return _first_family(offer.name)


def _sources_text(*values) -> str:
    return _norm(" ".join(str(v) for v in values if v))


def offer_product_type(offer) -> str | None:
    params = offer.params or {}
    upholstery = False
    for key, value in params.items():
        if "обивк" in _norm(key) and str(value or "").strip():
            upholstery = True
            break
    material_text = _sources_text(
        " ".join(str(v) for k, v in params.items() if "материал" in _norm(k)),
        offer.category_raw,
        offer.name,
    )
    text = _params_text(params) + " " + _norm(offer.name)
    if upholstery or any(word in text for word in SOFT_WORDS):
        return "soft"
    if any(word in material_text for word in WOOD_WORDS):
        return "wood"
    if any(word in material_text for word in METAL_WORDS):
        return "metal"
    if any(word in material_text for word in STONE_WORDS):
        return "stone"
    if any(word in material_text for word in GLASS_WORDS):
        return "glass"
    return None


def vision_product_type(product: dict | None) -> str | None:
    if not product:
        return None
    text = _sources_text(
        product.get("product_type"),
        product.get("material"),
        product.get("label"),
        product.get("description"),
        product.get("search_query") or product.get("searchQuery"),
    )
    if any(word in text for word in SOFT_WORDS):
        return "soft"
    if any(word in text for word in WOOD_WORDS):
        return "wood"
    if any(word in text for word in METAL_WORDS):
        return "metal"
    if any(word in text for word in STONE_WORDS):
        return "stone"
    if any(word in text for word in GLASS_WORDS):
        return "glass"
    return None


def vision_color_family(product: dict | None) -> str | None:
    if not product:
        return None
    return _first_family(product.get("color"))


def _size_hit(text: str, size) -> bool:
    numbers = set(re.findall(r"\d+", str(size or "")))
    if not numbers:
        return False
    hits = sum(1 for number in numbers if number in text)
    return hits / len(numbers) >= 0.5


def attribute_score(product: dict | None, offer) -> float:
    """0..1: совпадение атрибутов объекта (vision) с оффером каталога."""
    if not product:
        return 0.0
    params = offer.params or {}
    text = _norm(
        " ".join(
            str(part)
            for part in (
                offer.name,
                offer.description,
                offer.category_raw,
                offer.category,
                json.dumps(params, ensure_ascii=False),
            )
            if part
        )
    )
    parts: list[tuple[float, float]] = []

    wanted_type = vision_product_type(product)
    offer_type = offer_product_type(offer)
    if wanted_type and offer_type:
        parts.append((0.35, 1.0 if wanted_type == offer_type else 0.0))

    wanted_color = vision_color_family(product)
    offer_family = offer_color_family(offer)
    if wanted_color and offer_family:
        parts.append((0.30, 1.0 if wanted_color == offer_family else 0.0))
    elif wanted_color:
        parts.append((0.30, 0.5))

    if product.get("material"):
        material = _keywords(product["material"])
        parts.append(
            (0.15, 1.0 if material and any(t in text for t in material) else 0.0)
        )

    if product.get("size"):
        parts.append((0.10, 1.0 if _size_hit(text, product["size"]) else 0.0))

    keywords = (
        _keywords(product.get("label"))
        | _keywords(product.get("search_query") or product.get("searchQuery"))
        | _keywords(product.get("description"))
    )
    if keywords:
        hits = sum(1 for token in keywords if token in text)
        parts.append((0.10, hits / len(keywords)))

    if not parts:
        return 0.0
    total_weight = sum(weight for weight, _ in parts)
    return sum(weight * value for weight, value in parts) / total_weight
