"""AI-сетка как в приложении: vision → список объектов → FLUX-сетка 2×5 → ячейки."""

from __future__ import annotations

import base64
import io
import json
import os
import re

import httpx
from PIL import Image

from .imaging import _card, _encode
from .categories import VISION_CATEGORIES, INTERNAL_LABELS

BASE = os.environ.get("OPENROUTER_BASE", "https://openrouter.ai/api/v1")
VISION_MODEL = os.environ.get("SEARCH_VISION_MODEL", "google/gemini-3.1-pro-preview")
GRID_MODEL = os.environ.get("SEARCH_GRID_MODEL", "black-forest-labs/flux-3-image-klein")
GRID_ASPECT = os.environ.get("SEARCH_GRID_ASPECT", "21:9")
GRID_RESOLUTION = os.environ.get("SEARCH_GRID_RESOLUTION", "1K")
TIMEOUT = float(os.environ.get("OPENROUTER_TIMEOUT_S", "180"))

CATEGORY_GUIDE = "\n".join(
    f"- {key} — {INTERNAL_LABELS.get(key, key)}" for key in VISION_CATEGORIES
)

VISION_PROMPT = f"""Ты — внимательный аналитик интерьера. Смотри на фото так, чтобы каждый товар можно было легко найти в нашем каталоге.
Верни строго JSON без текста вокруг:
{{
  "room": {{
    "type": "кухня",
    "style": "современный",
    "lighting": "естественный свет из окна, тёплые подвесы",
    "walls": {{"color": "белый", "material": "краска", "pattern": "без узора", "description": "..."}},
    "floor": {{"type": "керамогранит", "color": "серый", "pattern": "под бетон", "description": "..."}},
    "ceiling": {{"type": "натяжной", "color": "белый", "description": "..."}}
  }},
  "objects": [
    {{"category":"sideboard","product_type":"деревянная","label":"Тумба","description":"прикроватная тумба на ножках, 2 ящика, ручки-кнопки, шпон дуба","color":"коричневый","material":"дуб","size":"45×40×55","search_query":"тумба на ножках дуб 2 ящика","bbox":[0.1,0.2,0.3,0.4],"confidence":0.9,"visibility":"seen"}}
  ]
}}
Правила:
- Отметь до 20 видимых товаров, которые реально можно купить: мебель, свет, текстиль, декор, техника, отделка стен/пола/потолка.
- Смотри «под каталог»: простые слова для цвета (коричневый, бежевый, серый, белый, чёрный, синий, зелёный, красный, розовый, жёлтый) и материала (дерево, дуб, ЛДСП, МДФ, металл, стекло, камень, велюр, рогожка, ткань, керамика).
- category — строго одно из списка (ключ — что это значит):
{CATEGORY_GUIDE}
- ВАЖНО: тумба/комод/прикроватная тумба/ТВ-тумба → sideboard; кухонный гарнитур/кухонные шкафы/фасады → cabinet; стеллаж/полки/коробки/корзины → storage; мусорное ведро/бак/корзина для мусора → cleaning.
- description — 1–2 предложения со ВСЕМИ видимыми деталями: опоры (ножки/цоколь/подвесной), форма, ручки/фурнитура, ящики/двери/полки, обивка/изголовье/подлокотники, материал, цвет.
- ОБЯЗАТЕЛЬНО про опоры: видишь ножки — «на ножках»; цоколь — «на цоколе»; подвесной — «подвесной».
- search_query — короткая фраза для поиска в каталоге: тип + опоры + материал + цвет + размер (например, «тумба на ножках дуб 2 ящика»).
- Стены: цвет, материал (обои/краска/панели/штукатурка), узор. Пол: тип (ламинат/паркет/плитка/керамогранит/ковролин), цвет, рисунок. Потолок: тип, цвет. Освещение: источники и температура.
- room обязателен: type, style, lighting, walls, floor, ceiling. Если поверхность не видна — оставь пустые поля, но НЕ пропускай ключи walls/floor/ceiling.
- Не дублируй один и тот же предмет. Если видишь несколько одинаковых — это разные экземпляры, у них разные bbox; не повторяй один и тот же объект дважды.
- color — цвет обивки/каркаса самого товара; игнорируй бельё, подушки, пледы, декор и фон.
- product_type — тип изделия: мягкая, деревянная, металлическая, стеклянная, каменная, смешанная.
- bbox — нормализованные [x,y,w,h] от 0 до 1. Если предмет не виден — не добавляй.
- Без брендов, цен и выдуманных артикулов. Только JSON."""

GRID_PROMPT = """Ты генерируешь референс-лист товаров для интерьерного поиска.
Создай одно изображение-сетку {rows} ряда × {cols} колонок на чистом белом фоне.
В каждой ячейке — один изолированный товар из списка ниже, в том же порядке, целиком, без обрезки.
Ровные поля между ячейками, одинаковый размер ячеек, мягкая тень, студийный свет.
Никакого текста, подписей, цифр, логотипов, людей и лишних предметов.
Товары:
{objects}
Только изображение сетки, без текста вокруг."""


def _key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY не задан")
    return key


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_key()}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("APP_URL", "http://localhost:3000"),
    }


def _grid_layout(count: int) -> tuple[int, int]:
    if count <= 10:
        return 2, 5
    if count <= 12:
        return 3, 4
    if count <= 15:
        return 3, 5
    return 4, 5


def _grid_aspect(rows: int, cols: int) -> str:
    ratio = cols / max(1, rows)
    if ratio >= 2.2:
        return "21:9"
    if ratio >= 1.6:
        return "16:9"
    if ratio >= 1.3:
        return "3:2"
    if ratio >= 1.05:
        return "4:3"
    return "1:1"


def build_grid_prompt(objects: list[dict], rows: int = 2, cols: int = 5) -> str:
    lines = []
    for i, obj in enumerate(objects):
        attrs = ", ".join(
            str(obj.get(key)).strip()
            for key in ("color", "material", "size")
            if obj.get(key)
        )
        desc = str(obj.get("description") or "").strip()
        lines.append(f"{i + 1}. {obj.get('label', 'товар')} — {desc} ({attrs})")
    return (
        GRID_PROMPT.replace("{rows}", str(rows))
        .replace("{cols}", str(cols))
        .replace("{objects}", "\n".join(lines))
    )


def _extract_image_b64(data: dict) -> str:
    url = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("images", [{}])[0]
        .get("image_url", {})
        .get("url", "")
    )
    match = re.search(r"base64,(.+)$", url or "")
    if match:
        return match.group(1)
    if data.get("data") and data["data"][0].get("b64_json"):
        return data["data"][0]["b64_json"]
    raise RuntimeError("в ответе /images нет картинки")


def _norm_label(value) -> str:
    return re.sub(r"\s+", " ", str(value or "").lower().replace("ё", "е")).strip()


def _bbox_iou(a, b) -> float:
    if not (
        isinstance(a, (list, tuple))
        and isinstance(b, (list, tuple))
        and len(a) == 4
        and len(b) == 4
    ):
        return 0.0
    try:
        ax, ay, aw, ah = (float(v) for v in a)
        bx, by, bw, bh = (float(v) for v in b)
    except (TypeError, ValueError):
        return 0.0
    ax2, ay2, bx2, by2 = ax + aw, ay + ah, bx + bw, by + bh
    ix = max(0.0, min(ax2, bx2) - max(ax, bx))
    iy = max(0.0, min(ay2, by2) - max(ay, by))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def _dedupe_objects(objects: list[dict]) -> list[dict]:
    unique = []
    for obj in objects:
        label = _norm_label(obj.get("label"))
        category = str(obj.get("category") or "").lower()
        duplicate = False
        for existing in unique:
            iou = _bbox_iou(obj.get("bbox"), existing.get("bbox"))
            if label and label == _norm_label(existing.get("label")):
                if iou > 0.5 or not obj.get("bbox") or not existing.get("bbox"):
                    duplicate = True
                    break
            elif (
                category
                and category == str(existing.get("category") or "").lower()
                and iou > 0.8
            ):
                duplicate = True
                break
        if not duplicate:
            unique.append(obj)
    return unique


def vision_full(image_bytes: bytes, mime: str = "image/jpeg") -> dict:
    image_b64 = base64.b64encode(image_bytes).decode()
    body = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": VISION_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Опиши комнату и все видимые товары. Только JSON.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{image_b64}"},
                    },
                ],
            },
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
    }
    response = httpx.post(
        f"{BASE}/chat/completions", headers=_headers(), json=body, timeout=TIMEOUT
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    match = re.search(r"\{[\s\S]*\}", content or "")
    parsed = json.loads(match.group(0)) if match else {}
    allowed = set(VISION_CATEGORIES) | {"other"}
    objects = []
    for obj in parsed.get("objects") or []:
        if not isinstance(obj, dict):
            continue
        category = str(obj.get("category") or "").strip()
        obj["category"] = category if category in allowed else "other"
        objects.append(obj)
    room = parsed.get("room") or {}
    if not isinstance(room, dict):
        room = {}
    for key in ("walls", "floor", "ceiling"):
        value = room.get(key)
        if isinstance(value, str):
            room[key] = {"description": value}
        elif not isinstance(value, dict):
            room[key] = {}
    return {"room": room, "objects": _dedupe_objects(objects)[:20]}


def vision_objects(image_b64: str, mime: str = "image/jpeg") -> list[dict]:
    return vision_full(base64.b64decode(image_b64), mime)["objects"]


CELL_PROMPT = f"""Ты проверяешь одну ячейку сетки товаров. Верни строго JSON:
{{"ok":true,"label":"...","category":"...","description":"...","color":"...","material":"...","product_type":"...","search_query":"..."}}
ok=true, если в ячейке ровно один целый товар и он соответствует ожидаемому.
category — строго из списка (ключ — значение):
{CATEGORY_GUIDE}
ВАЖНО: тумба/комод/прикроватная тумба/ТВ-тумба → sideboard; кухонный гарнитур/кухонные шкафы → cabinet; стеллаж/полки/коробки/корзины → storage; мусорное ведро/бак → cleaning.
description — все видимые детали, включая опоры (на ножках/на цоколе/подвесной).
Ожидаемый товар: {{label}}
Только JSON."""


def check_cell(cell_bytes: bytes, expected_label: str) -> dict:
    allowed = set(VISION_CATEGORIES) | {"other"}
    data_url = "data:image/jpeg;base64," + base64.b64encode(cell_bytes).decode()
    body = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": CELL_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": f"Проверь ячейку. Ожидаемый товар: {expected_label}",
                    },
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0,
    }
    response = httpx.post(
        f"{BASE}/chat/completions", headers=_headers(), json=body, timeout=TIMEOUT
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    match = re.search(r"\{[\s\S]*\}", content or "")
    parsed = json.loads(match.group(0)) if match else {}
    category = str(parsed.get("category") or "").strip()
    return {
        "ok": bool(parsed.get("ok")),
        "label": str(parsed.get("label") or "")[:160],
        "category": category if category in allowed else "other",
        "description": str(parsed.get("description") or "")[:300],
        "color": str(parsed.get("color") or "")[:60],
        "material": str(parsed.get("material") or "")[:80],
        "product_type": str(parsed.get("product_type") or "")[:60],
        "search_query": str(parsed.get("search_query") or "")[:160],
    }


def generate_grid(image_b64: str, mime: str = "image/jpeg") -> str:
    objects = vision_objects(image_b64, mime)
    if not objects:
        raise RuntimeError("vision не вернул объекты")
    body = {
        "model": GRID_MODEL,
        "prompt": build_grid_prompt(objects),
        "aspect_ratio": GRID_ASPECT,
        "resolution": GRID_RESOLUTION,
    }
    response = httpx.post(
        f"{BASE}/images", headers=_headers(), json=body, timeout=TIMEOUT
    )
    response.raise_for_status()
    return _extract_image_b64(response.json())


PRODUCT_FIELDS = (
    "label",
    "description",
    "color",
    "material",
    "size",
    "category",
    "product_type",
    "search_query",
    "hex",
)


def _product(obj: dict) -> dict:
    return {key: obj.get(key) for key in PRODUCT_FIELDS if obj.get(key)}


def slice_grid(
    grid_bytes: bytes,
    labels: list[str] | None = None,
    products: list[dict] | None = None,
    rows: int = 2,
    cols: int = 5,
    margin: float = 0.045,
) -> list[dict]:
    image = Image.open(io.BytesIO(grid_bytes)).convert("RGB")
    width, height = image.size
    cell_w, cell_h = width / cols, height / rows
    pad = margin * min(cell_w, cell_h)
    items: list[dict] = []
    for r in range(rows):
        for c in range(cols):
            left = round(c * cell_w + pad)
            top = round(r * cell_h + pad)
            w = max(1, round(cell_w - 2 * pad))
            h = max(1, round(cell_h - 2 * pad))
            cell = image.crop((left, top, left + w, top + h))
            idx = r * cols + c
            label = labels[idx] if labels and idx < len(labels) else f"ячейка {idx + 1}"
            item = {
                "index": idx,
                "kind": "grid-ai",
                "label": label,
                "thumb_b64": _encode(_card(cell)),
                "cell_b64": _encode(cell, quality=90),
            }
            if products and idx < len(products):
                item["product"] = _product(products[idx])
            items.append(item)
    return items


def _verified_items(items: list[dict], objects: list[dict]) -> list[dict]:
    result = []
    for item in items:
        idx = int(item.get("index", 0))
        obj = objects[idx] if idx < len(objects) else {}
        try:
            check = check_cell(
                base64.b64decode(item["cell_b64"]), str(obj.get("label") or "")
            )
        except Exception:  # noqa: BLE001 - vision-проверка не должна ронять сетку
            item["check_ok"] = False
            item["product"] = _product(obj)
            result.append(item)
            continue
        if not check.get("ok"):
            continue
        product = {
            "label": check.get("label") or obj.get("label"),
            "category": check.get("category") or obj.get("category"),
            "description": check.get("description") or obj.get("description"),
            "color": check.get("color") or obj.get("color"),
            "material": check.get("material") or obj.get("material"),
            "product_type": check.get("product_type") or obj.get("product_type"),
            "size": obj.get("size"),
            "search_query": check.get("search_query") or obj.get("search_query"),
        }
        item["product"] = {key: value for key, value in product.items() if value}
        item["label"] = item["product"].get("label") or item.get("label")
        item["check_ok"] = True
        result.append(item)
    return result


def generate_products(
    image_bytes: bytes,
    verify: bool = True,
    objects: list[dict] | None = None,
) -> list[dict]:
    if objects is None:
        objects = vision_full(image_bytes)["objects"]
    if not objects:
        raise RuntimeError("vision не вернул объекты")
    rows, cols = _grid_layout(len(objects))
    body = {
        "model": GRID_MODEL,
        "prompt": build_grid_prompt(objects, rows, cols),
        "aspect_ratio": _grid_aspect(rows, cols),
        "resolution": GRID_RESOLUTION,
    }
    response = httpx.post(
        f"{BASE}/images", headers=_headers(), json=body, timeout=TIMEOUT
    )
    response.raise_for_status()
    grid_bytes = base64.b64decode(_extract_image_b64(response.json()))
    labels = [str(o.get("label") or f"товар {i + 1}") for i, o in enumerate(objects)]
    items = slice_grid(grid_bytes, labels, products=objects, rows=rows, cols=cols)
    return _verified_items(items, objects) if verify else items
