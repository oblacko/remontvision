"""Импорт офферов и фоновая векторизация картинок."""

from __future__ import annotations

import hashlib
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from . import color
from .httpguard import is_public_http_url
from .models import Offer


def caching_fetcher(base_fetch, cache_dir: str):
    """Кэширует скачанные картинки на диск, чтобы не качать их повторно."""

    def fetch(url: str) -> bytes:
        key = hashlib.sha256(str(url).encode("utf-8")).hexdigest()
        path = os.path.join(cache_dir, key + ".img")
        try:
            with open(path, "rb") as fh:
                return fh.read()
        except OSError:
            pass
        data = base_fetch(url)
        try:
            os.makedirs(cache_dir, exist_ok=True)
            with open(path, "wb") as fh:
                fh.write(data)
        except OSError:
            pass
        return data

    return fetch


@dataclass
class ImportResult:
    created: int = 0
    updated: int = 0
    unchanged: int = 0


@dataclass
class EmbedResult:
    embedded: int = 0
    skipped: int = 0
    failed: int = 0


def content_hash(parsed) -> str:
    parts = "|".join(
        str(v)
        for v in (
            parsed.external_id,
            parsed.picture_url,
            parsed.price,
            parsed.old_price,
            parsed.availability,
        )
    )
    return hashlib.sha256(parts.encode("utf-8")).hexdigest()


def build_offer(feed_id: int, parsed, hash_value: str) -> Offer:
    return Offer(
        feed_id=feed_id,
        external_id=parsed.external_id,
        name=parsed.name,
        merchant=parsed.merchant,
        category=parsed.category,
        category_raw=parsed.category_raw,
        vendor=parsed.vendor,
        model=parsed.model,
        description=parsed.description,
        price=parsed.price,
        old_price=parsed.old_price,
        currency=parsed.currency,
        availability=parsed.availability,
        picture_url=parsed.picture_url,
        canonical_url=parsed.canonical_url,
        affiliate_url=parsed.affiliate_url,
        erid=parsed.erid,
        params=dict(parsed.params or {}),
        raw=dict(parsed.raw or {}),
        status="active",
        content_hash=hash_value,
    )


def import_offers(repo, feed_id: int, parsed_offers) -> ImportResult:
    result = ImportResult()
    for parsed in parsed_offers:
        hash_value = content_hash(parsed)
        existing = repo.find_offer(feed_id, parsed.external_id)
        offer = build_offer(feed_id, parsed, hash_value)
        if existing is None:
            repo.upsert_offer(offer)
            result.created += 1
            continue
        if existing.content_hash == hash_value:
            result.unchanged += 1
            continue
        # Картинка изменилась — старый эмбеддинг больше не валиден.
        if existing.picture_url and existing.picture_url != offer.picture_url:
            repo.delete_embeddings(existing.id)
        offer.id = existing.id
        repo.upsert_offer(offer)
        result.updated += 1
    return result


def _prepare_embedding(offer, embedder, fetch_image):
    if not offer.picture_url or not is_public_http_url(offer.picture_url):
        return "skipped", offer, None
    try:
        data = fetch_image(offer.picture_url)
        if not data:
            return "skipped", offer, None
        vector = embedder.embed_image(data)
        try:
            hist = color.descriptor(data)
        except Exception:  # noqa: BLE001 - эмбеддинг важнее цвета
            hist = None
        return "embedded", offer, {"vector": vector, "color": hist}
    except Exception as exc:  # noqa: BLE001 - один битый оффер не должен ронять синк
        return "failed", offer, str(exc)[:200]


def embed_pending(
    repo, embedder, fetch_image, limit: int = 100, concurrency: int = 16
) -> EmbedResult:
    """Скачивает и эмбеддит картинки параллельно, пишет в репозиторий по очереди."""
    result = EmbedResult()
    offers = repo.list_without_embedding(limit)
    if not offers:
        return result
    outcomes = []
    with ThreadPoolExecutor(max_workers=max(1, int(concurrency or 1))) as pool:
        futures = [
            pool.submit(_prepare_embedding, o, embedder, fetch_image) for o in offers
        ]
        for future in as_completed(futures):
            outcomes.append(future.result())
    # Запись строго в главном потоке: один pg-connection не потокобезопасен.
    logged = 0
    for status, offer, payload in outcomes:
        if status == "embedded":
            repo.put_embedding(
                offer.id, embedder.model, embedder.dim, payload["vector"]
            )
            if payload.get("color"):
                repo.set_color(offer.id, payload["color"])
            result.embedded += 1
        elif status == "skipped":
            result.skipped += 1
        else:
            result.failed += 1
            if logged < 5:
                print(f"[embed] failed {offer.picture_url}: {payload}", flush=True)
                logged += 1
    return result


def embed_all(
    repo,
    embedder,
    fetch_image,
    batch: int = 100,
    max_batches: int = 1000,
    concurrency: int = 16,
) -> EmbedResult:
    """Векторизует все ожидающие офферы партиями, пока есть прогресс."""
    total = EmbedResult()
    for _ in range(max_batches):
        res = embed_pending(repo, embedder, fetch_image, batch, concurrency)
        total.embedded += res.embedded
        total.skipped += res.skipped
        total.failed += res.failed
        if res.embedded == 0:
            break
    return total


@dataclass
class ColorResult:
    colored: int = 0
    skipped: int = 0
    failed: int = 0


def _prepare_color(offer, fetch_image):
    if not offer.picture_url or not is_public_http_url(offer.picture_url):
        return "skipped", offer, None
    try:
        data = fetch_image(offer.picture_url)
        if not data:
            return "skipped", offer, None
        return "colored", offer, color.descriptor(data)
    except Exception as exc:  # noqa: BLE001 - один битый оффер не должен ронять синк
        return "failed", offer, str(exc)[:200]


def backfill_colors(
    repo, fetch_image, limit: int = 200, concurrency: int = 16
) -> ColorResult:
    """Досчитывает цветовые дескрипторы для офферов без них."""
    result = ColorResult()
    offers = repo.list_without_color(limit)
    if not offers:
        return result
    outcomes = []
    with ThreadPoolExecutor(max_workers=max(1, int(concurrency or 1))) as pool:
        futures = [pool.submit(_prepare_color, o, fetch_image) for o in offers]
        for future in as_completed(futures):
            outcomes.append(future.result())
    logged = 0
    for status, offer, payload in outcomes:
        if status == "colored":
            repo.set_color(offer.id, payload)
            result.colored += 1
        elif status == "skipped":
            result.skipped += 1
        else:
            result.failed += 1
            if logged < 5:
                print(f"[color] failed {offer.picture_url}: {payload}", flush=True)
                logged += 1
    return result


def backfill_all_colors(
    repo, fetch_image, batch: int = 200, max_batches: int = 1000, concurrency: int = 16
) -> ColorResult:
    total = ColorResult()
    for _ in range(max_batches):
        res = backfill_colors(repo, fetch_image, batch, concurrency)
        total.colored += res.colored
        total.skipped += res.skipped
        total.failed += res.failed
        if res.colored == 0:
            break
    return total
