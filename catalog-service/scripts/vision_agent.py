#!/usr/bin/env python3
"""Vision-агент: смотрит фото и ищет товары через инструменты каталога.

Запуск (в контейнере, venv с httpx):
  /tmp/mcpenv/bin/python /app/scripts/vision_agent.py --image /tmp/room.jpg --top-k 5
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import catalog_tools as tools  # noqa: E402

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
Финальный ответ — только JSON."""


def chat(messages: list[dict], use_tools: bool = True, force_json: bool = False) -> dict:
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


def run(image_path: str, top_k: int = 5, max_steps: int = 10) -> dict:
    image_bytes = Path(image_path).read_bytes()
    mime = mimetypes.guess_type(image_path)[0] or "image/jpeg"
    image_url = f"data:{mime};base64,{base64.b64encode(image_bytes).decode()}"
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM},
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": f"Подбери товары по фото. Верни до 20 предметов, top_k={top_k}.",
                },
                {"type": "image_url", "image_url": {"url": image_url}},
            ],
        },
    ]
    final = ""
    for step in range(max_steps):
        message = chat(messages)
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
                summary = len(result) if isinstance(result, list) else result
                print(
                    f"[tool] {name} {json.dumps(arguments, ensure_ascii=False)[:200]} -> {str(summary)[:200]}",
                    file=sys.stderr,
                )
            except Exception as exc:  # noqa: BLE001
                payload = json.dumps({"error": str(exc)}, ensure_ascii=False)
                print(f"[tool] {name} ERROR {exc}", file=sys.stderr)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id"),
                    "content": payload,
                }
            )
    if not final:
        messages.append(
            {
                "role": "user",
                "content": "Поиск завершён. Верни финальный JSON строго по схеме из системного сообщения, без вызова инструментов.",
            }
        )
        message = chat(messages, use_tools=False, force_json=True)
        final = str(message.get("content") or "")
    match = re.search(r"\{[\s\S]*\}", final)
    return json.loads(match.group(0)) if match else {"raw": final}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--max-steps", type=int, default=10)
    parser.add_argument("--out", default="")
    args = parser.parse_args()
    result = run(args.image, top_k=args.top_k, max_steps=args.max_steps)
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
