#!/usr/bin/env python3
"""CLI для каталог-сервиса: загрузка фидов и поиск.

Примеры:
    python scripts/catalog_cli.py list-feeds
    python scripts/catalog_cli.py add-feed "Pampadu 789" https://finoffers.pampadu.ru/feeds/api/user-feeds/789/export
    python scripts/catalog_cli.py sync 1 --wait
    python scripts/catalog_cli.py search ./query.jpg --category bed --top-k 10
    python scripts/catalog_cli.py search ./query.jpg --price-min 20000 --price-max 60000

URL/токен берутся из --url/--token или CATALOG_SERVICE_URL/CATALOG_SERVICE_TOKEN.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request


def call(base, token, path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base.rstrip("/") + path, data=data, method=method)
    req.add_header("x-catalog-token", token)
    if data is not None:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise SystemExit(f"HTTP {exc.code}: {detail}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--url", default=os.environ.get("CATALOG_SERVICE_URL", "http://127.0.0.1:8000")
    )
    parser.add_argument(
        "--token", default=os.environ.get("CATALOG_SERVICE_TOKEN", "change-me")
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list-feeds")

    add = sub.add_parser("add-feed")
    add.add_argument("name")
    add.add_argument("url")
    add.add_argument("--format", default="yml")
    add.add_argument("--adapter", default="pampadu_yml")

    sync = sub.add_parser("sync")
    sync.add_argument("feed_id", type=int)
    sync.add_argument("--wait", action="store_true")

    search = sub.add_parser("search")
    search.add_argument("image")
    search.add_argument("--text")
    search.add_argument("--category")
    search.add_argument("--price-min", type=float)
    search.add_argument("--price-max", type=float)
    search.add_argument("--top-k", type=int, default=10)
    search.add_argument("--min-score", type=float, default=0.0)

    args = parser.parse_args()
    base, token = args.url, args.token

    if args.cmd == "list-feeds":
        for feed in call(base, token, "/feeds") or []:
            print(
                f"#{feed['id']:>2}  offers={feed['offer_count']:>5}  {feed['name']}  {feed['url']}"
            )
        return

    if args.cmd == "add-feed":
        feed = call(
            base,
            token,
            "/feeds",
            "POST",
            {
                "name": args.name,
                "url": args.url,
                "format": args.format,
                "adapter": args.adapter,
            },
        )
        print(json.dumps(feed, ensure_ascii=False))
        return

    if args.cmd == "sync":
        job = call(base, token, f"/feeds/{args.feed_id}/sync", "POST")
        print("job:", job.get("job_id"))
        if not args.wait:
            return
        deadline = time.time() + 3600
        while time.time() < deadline:
            status = call(base, token, f"/feeds/{args.feed_id}/status")
            last = status.get("last_job") or {}
            print(f"  {last.get('status')}  {last}")
            if last.get("status") in ("done", "failed"):
                break
            time.sleep(5)
        return

    if args.cmd == "search":
        with open(args.image, "rb") as fh:
            image_b64 = base64.b64encode(fh.read()).decode()
        filters = {}
        if args.category:
            filters["categories"] = [args.category]
        if args.price_min is not None:
            filters["price_min"] = args.price_min
        if args.price_max is not None:
            filters["price_max"] = args.price_max
        body = {
            "image_b64": image_b64,
            "filters": filters,
            "top_k": args.top_k,
            "min_score": args.min_score,
        }
        if args.text:
            body["text"] = args.text
        result = call(base, token, "/search", "POST", body)
        for row in result.get("results", []):
            print(
                f"{row['score']:.3f}  {str(row.get('category')):12} {str(row.get('name'))[:50]:50} "
                f"{row.get('price')}  {row.get('merchant')}"
            )
            print(
                f"       {row.get('affiliate_url') or row.get('canonical_url')}  erid={row.get('erid')}"
            )
        return


if __name__ == "__main__":
    main()
