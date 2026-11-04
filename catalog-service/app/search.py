"""Поиск по эмбеддингу + цветовой и атрибутный re-rank."""

from __future__ import annotations

from dataclasses import dataclass

from . import attributes, color


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
    attr_score: float | None = None,
    category_fallback: bool = False,
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
    if attr_score is not None:
        row["attr_score"] = round(float(attr_score), 6)
    if category_fallback:
        row["category_fallback"] = True
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
    product: dict | None = None,
    attr_weight: float = 0.0,
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
    attr_weight = max(0.0, min(0.9, float(attr_weight or 0.0)))
    if color_weight + attr_weight > 0.85:
        scale = 0.85 / (color_weight + attr_weight)
        color_weight *= scale
        attr_weight *= scale

    rerank = image_bytes is not None and (color_weight > 0 or attr_weight > 0)
    pool = top_k
    if rerank:
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
    category_fallback = False
    if filters.categories and not rows:
        broader = repo.search(
            embedding,
            {
                "categories": None,
                "price_min": filters.price_min,
                "price_max": filters.price_max,
                "merchant": filters.merchant,
            },
            pool,
            min_score,
        )
        if broader:
            rows = broader
            category_fallback = True

    if rerank and rows:
        if product and attr_weight > 0:
            wanted_type = attributes.vision_product_type(product)
            if wanted_type:
                filtered = [
                    (offer, score)
                    for offer, score in rows
                    if not (
                        attributes.offer_product_type(offer)
                        and attributes.offer_product_type(offer) != wanted_type
                    )
                ]
                if filtered:
                    rows = filtered
        query_hist = color.descriptor(image_bytes) if color_weight > 0 else None
        scored = []
        for offer, dino_score in rows:
            csim = (
                color.similarity(query_hist, getattr(offer, "color_hist", None))
                if query_hist is not None
                else 0.0
            )
            asim = (
                attributes.attribute_score(product, offer) if attr_weight > 0 else 0.0
            )
            final = (
                (1 - color_weight - attr_weight) * dino_score
                + color_weight * csim
                + attr_weight * asim
            )
            scored.append((offer, final, dino_score, csim, asim))
        scored.sort(key=lambda item: item[1], reverse=True)
        return [
            _map_row(offer, final, dino_score, csim, asim, category_fallback)
            for offer, final, dino_score, csim, asim in scored[:top_k]
        ]

    return [
        _map_row(offer, score, category_fallback=category_fallback)
        for offer, score in rows[:top_k]
    ]


def search_by_keywords(
    repo,
    *,
    query: str = "",
    filters: SearchFilters | None = None,
    product: dict | None = None,
    top_k: int = 20,
) -> list[dict]:
    filters = filters or SearchFilters()
    top_k = max(1, min(100, int(top_k)))
    rows = repo.search_text(
        query or "",
        {
            "categories": filters.categories,
            "price_min": filters.price_min,
            "price_max": filters.price_max,
            "merchant": filters.merchant,
        },
        product,
        top_k,
    )
    result = []
    for offer, score in rows:
        row = _map_row(offer, score)
        row["match"] = "text"
        result.append(row)
    return result


def vision_search(repo, image_bytes: bytes, top_k: int = 5) -> dict:
    import io

    import numpy as np
    from PIL import Image

    from . import gridai, imaging

    result = gridai.vision_full(image_bytes)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    width, height = image.size
    items = []
    for obj in result.get("objects") or []:
        thumb = None
        bbox = obj.get("bbox")
        if isinstance(bbox, list) and len(bbox) == 4:
            try:
                x, y, w, h = (float(v) for v in bbox)
                x0 = max(0, min(width - 1, int(x * width)))
                y0 = max(0, min(height - 1, int(y * height)))
                x1 = max(x0 + 1, min(width, int((x + w) * width)))
                y1 = max(y0 + 1, min(height, int((y + h) * height)))
                thumb = imaging._encode(imaging._card(image.crop((x0, y0, x1, y1))))
            except (TypeError, ValueError):
                thumb = None
        query = str(obj.get("search_query") or obj.get("label") or "")
        category = obj.get("category")
        category_filters = SearchFilters(
            categories=[category] if category and category != "other" else None
        )
        if category_filters.categories:
            in_category = search_by_keywords(
                repo, query="", filters=category_filters, product=obj, top_k=top_k
            )
            if not in_category:
                from .categories import INTERNAL_LABELS

                label = INTERNAL_LABELS.get(category, category)
                items.append(
                    {
                        "object": obj,
                        "thumb_b64": thumb,
                        "results": [],
                        "note": f"В каталоге нет товаров категории «{label}»",
                    }
                )
                continue
            rows = search_by_keywords(
                repo, query=query, filters=category_filters, product=obj, top_k=top_k
            )
            if not rows:
                rows = in_category
        else:
            rows = search_by_keywords(
                repo, query=query, filters=SearchFilters(), product=obj, top_k=top_k
            )
            if not rows and any(
                obj.get(key) for key in ("color", "material", "product_type", "label")
            ):
                rows = search_by_keywords(
                    repo, query="", filters=SearchFilters(), product=obj, top_k=top_k
                )
        items.append({"object": obj, "thumb_b64": thumb, "results": rows})
    return {"room": result.get("room") or {}, "items": items}
