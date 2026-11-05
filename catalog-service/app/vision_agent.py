"""Vision-агент подбора товаров: смотрит фото и вызывает инструменты каталога."""

from __future__ import annotations

import base64
import json
import os
import re

import httpx

from . import catalog_tools as tools

BASE = os.environ.get("OPENROUTER_BASE", "https://openrouter.ai/api/v1")
MODEL = (
    os.environ.get("AGENT_MODEL")
    or os.environ.get("SEARCH_VISION_MODEL")
    or "deepseek/deepseek-v4.1-flash-1017"
)
TIMEOUT = float(os.environ.get("OPENROUTER_TIMEOUT_S", "300"))

SYSTEM = """Ты — агент подбора реальных товаров по фото интерьера. У тебя есть инструменты каталога.
Порядок работы:
1. Посмотри фото и определи комнату (type, style, lighting, walls, floor, ceiling) и ВСЕ видимые товары.
2. Для КАЖДОГО товара ОБЯЗАТЕЛЬНО вызови search_offers с категорией и/или query, цветом, материалом, типом.
3. Посмотри на реальные названия и params в выдаче. Если категория/тип/цвет не совпадают с предметом — вызови resolve_category, list_categories или category_stats и поищи снова. Не оставляй заведомо неверную категорию.
4. Если в категории 0 товаров (category_stats.count=0) — так и напиши, не подставляй товары из других категорий.
5. Не дублируй один и тот же предмет. Одинаковые предметы с разными bbox — разные экземпляры.
6. В финале верни СТРОГО JSON:
{"room": {"type":"...","style":"...","lighting":"...","walls":{"color":"...","material":"...","pattern":"..."},"floor":{"type":"...","color":"...","pattern":"..."},"ceiling":{"type":"...","color":"..."}},
 "items": [{"label":"...","category":"...","search_query":"...","offer_ids":["..."],"why":"..."}]}
offer_ids — только id из вызовов инструментов. Не выдумывай товары и id.
Описывай все видимые детали: опоры (на ножках/на цоколе/подвесной), ручки, ящики/двери, обивка/изголовье, материал, цвет.
Все текстовые поля для пользователя — строго на русском.
Финальный ответ — только JSON."""


def _chat(messages: list[dict], use_tools: bool = True, force_json: bool = False) -> dict:
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY не задан")
    body = {
        "model": MODEL,
        "messages": messages,
        "temperature": 0,
    }
    if use_tools:
        body["tools"] = tools.TOOL_SCHEMAS
        body["tool_choice"] = "auto"
    if force_json:
        body["response_format"] = {"type": "json_object"}
    response = httpx.post(
        f"{BASE}/chat/completions",
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.environ.get("APP_URL", "http://localhost:3000"),
        },
        json=body,
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]


def run_image(
    image_bytes: bytes,
    *,
    mime: str = "image/jpeg",
    room_type: str = "",
    style: str = "",
    top_k: int = 5,
    max_steps: int = 10,
) -> dict:
    image_url = f"data:{mime};base64,{base64.b64encode(image_bytes).decode()}"
    context = []
    if room_type:
        context.append(f"Тип комнаты: {room_type}.")
    if style:
        context.append(f"Стиль: {style}.")
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": " ".join(context + [f"Подбери товары по фото. Верни до 20 предметов, top_k={top_k}."]),
                },
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        },
    ]
    final = ""
    steps = max(1, min(14, int(max_steps or 10)))
    for _ in range(steps):
        message = _chat(messages)
        messages.append(message)
        calls = message.get("tool_calls") or []
        if not calls:
            final = str(message.get("content") or "")
            break
        for call in calls:
            function = call.get("function") or {}
            name = function.get("name")
            try:
                arguments = json.loads(function.get("arguments") or "{}")
            except json.JSONDecodeError:
                arguments = {}
            try:
                result = tools.dispatch(name, arguments)
                payload = json.dumps(result, ensure_ascii=False)[:12000]
            except Exception as exc:  # noqa: BLE001
                payload = json.dumps({"error": str(exc)}, ensure_ascii=False)
            messages.append({
                "role": "tool",
                "tool_call_id": call.get("id"),
                "content": payload,
            })
    if not final:
        messages.append({
            "role": "user",
            "content": "Поиск завершён. Верни финальный JSON строго по схеме из системного сообщения, без вызова инструментов.",
        })
        message = _chat(messages, use_tools=False, force_json=True)
        final = str(message.get("content") or "")
    match = re.search(r"\{[\s\S]*\}", final)
    return json.loads(match.group(0)) if match else {"raw": final}
