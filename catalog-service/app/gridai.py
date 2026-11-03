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

BASE = os.environ.get("OPENROUTER_BASE", "https://openrouter.ai/api/v1")
VISION_MODEL = os.environ.get("SEARCH_VISION_MODEL", "google/gemini-3.1-pro-preview")
GRID_MODEL = os.environ.get("SEARCH_GRID_MODEL", "black-forest-labs/flux-3-image-klein")
GRID_ASPECT = os.environ.get("SEARCH_GRID_ASPECT", "21:9")
GRID_RESOLUTION = os.environ.get("SEARCH_GRID_RESOLUTION", "1K")
TIMEOUT = float(os.environ.get("OPENROUTER_TIMEOUT_S", "180"))

VISION_PROMPT = """Ты — аналитик интерьера для подбора реальных товаров по фото. Верни строго JSON без текста вокруг:
{"objects":[{"category":"bed","label":"Кровать","description":"краткое описание видимого предмета","color":"беж","material":"дуб","size":"160×200"}]}
Правила:
- Отметь до 10 ключевых позиций, которые реально можно купить: мебель, свет, текстиль, декор, отделку пола/стен.
- Описывай видимые материал, цвет и форму; не выдумывай бренды, цены и артикулы.
- Только JSON."""

GRID_PROMPT = """Ты генерируешь референс-лист товаров для интерьерного поиска.
Создай одно изображение-сетку 2 ряда × 5 колонок (10 ячеек) на чистом белом фоне.
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


def build_grid_prompt(objects: list[dict]) -> str:
    lines = []
    for i, obj in enumerate(objects[:10]):
        attrs = ", ".join(
            str(obj.get(key)).strip()
            for key in ("color", "material", "size")
            if obj.get(key)
        )
        desc = str(obj.get("description") or "").strip()
        lines.append(f"{i + 1}. {obj.get('label', 'товар')} — {desc} ({attrs})")
    return GRID_PROMPT.replace("{objects}", "\n".join(lines))


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


def vision_objects(image_b64: str, mime: str = "image/jpeg") -> list[dict]:
    body = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": VISION_PROMPT},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "Разбери фото интерьера и верни JSON с объектами.",
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{image_b64}"},
                    },
                ],
            },
        ],
        "response_format": {"type": "json_object"},
    }
    response = httpx.post(
        f"{BASE}/chat/completions", headers=_headers(), json=body, timeout=TIMEOUT
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    match = re.search(r"\{[\s\S]*\}", content or "")
    parsed = json.loads(match.group(0)) if match else {}
    objects = parsed.get("objects") or []
    return [o for o in objects if isinstance(o, dict)][:10]


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


def slice_grid(
    grid_bytes: bytes,
    labels: list[str] | None = None,
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
            items.append(
                {
                    "index": idx,
                    "kind": "grid-ai",
                    "label": label,
                    "thumb_b64": _encode(_card(cell)),
                }
            )
    return items


def generate_products(image_bytes: bytes) -> list[dict]:
    image_b64 = base64.b64encode(image_bytes).decode()
    objects = vision_objects(image_b64)
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
    grid_bytes = base64.b64decode(_extract_image_b64(response.json()))
    labels = [str(o.get("label") or f"товар {i + 1}") for i, o in enumerate(objects)]
    return slice_grid(grid_bytes, labels)
