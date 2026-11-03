"""Поиск по эмбеддингу картинки/текста с фильтрами и цветовым re-rank."""

from __future__ import annotations

from dataclasses import dataclass

from . import color


@dataclass
class SearchFilters:
    categories: list[str] | None = None
    price_min: float | None = None
    price_max: float | None = None
    merchant: str | None = None


def _map_row(
    offer,
    score: float,
    dino_score: float | None = None,
    color_score: float | None = None,
) -> dict:
    row = {
        "offer_id": offer.id,
        "name": offer.name,
        "merchant": offer.merchant,
        "price": offer.price,
        "old_price": offer.old_price,
        "currency": offer.currency,
        "availability": offer.availability,
        "picture_url": offer.picture_url,
        "canonical_url": offer.canonical_url,
        "affiliate_url": offer.affiliate_url,
        "erid": offer.erid,
        "category": offer.category,
        "params": offer.params,
        "score": round(float(score), 6),
    }
    if dino_score is not None:
        row["dino_score"] = round(float(dino_score), 6)
    if color_score is not None:
        row["color_score"] = round(float(color_score), 6)
    return row


def search_offers(
    repo,
    embedder,
    *,
    image_bytes: bytes | None = None,
    text: str | None = None,
    filters: SearchFilters | None = None,
    top_k: int = 10,
    min_score: float = 0.0,
    color_weight: float = 0.0,
    rerank_pool: int = 100,
) -> list[dict]:
    if image_bytes is None and not (text and str(text).strip()):
        raise ValueError("Нужно изображение или текст для поиска")

    if image_bytes is not None:
        embedding = embedder.embed_image(image_bytes)
    else:
        try:
            embedding = embedder.embed_text(str(text))
        except Exception as exc:  # noqa: BLE001
            raise ValueError(str(exc))

    filters = filters or SearchFilters()
    top_k = max(1, min(100, int(top_k)))
    min_score = max(-1.0, min(1.0, float(min_score)))
    color_weight = max(0.0, min(0.9, float(color_weight or 0.0)))

    # При цветовом re-rank берём более широкий пул кандидатов по DINOv2.
    pool = top_k
    if image_bytes is not None and color_weight > 0:
        pool = max(top_k, min(200, int(rerank_pool or top_k * 4)))

    rows = repo.search(
        embedding,
        {
            "categories": filters.categories,
            "price_min": filters.price_min,
            "price_max": filters.price_max,
            "merchant": filters.merchant,
        },
        pool,
        min_score,
    )

    if image_bytes is not None and color_weight > 0 and rows:
        query_hist = color.descriptor(image_bytes)
        reranked = []
        for offer, dino_score in rows:
            csim = color.similarity(query_hist, getattr(offer, "color_hist", None))
            final = (1 - color_weight) * dino_score + color_weight * csim
            reranked.append((offer, final, dino_score, csim))
        reranked.sort(key=lambda item: item[1], reverse=True)
        return [
            _map_row(offer, final, dino_score, csim)
            for offer, final, dino_score, csim in reranked[:top_k]
        ]

    return [_map_row(offer, score) for offer, score in rows[:top_k]]
