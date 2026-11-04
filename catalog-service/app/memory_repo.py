"""In-memory реализация репозитория: тесты и локальный запуск без БД."""

from __future__ import annotations

import json
import uuid

from . import attributes, vectors
from .models import Feed, Offer


class MemoryOfferRepository:
    def __init__(self):
        self.feeds: dict[int, Feed] = {}
        self.offers: dict[str, Offer] = {}
        self.embeddings: dict[tuple[str, str], tuple[int, list[float]]] = {}
        self._offer_ids: dict[tuple[int, str], str] = {}
        self.categories: dict[tuple[int, str], dict] = {}
        self._feed_seq = 0

    def upsert_feed(self, feed: Feed) -> Feed:
        if feed.id is None:
            self._feed_seq += 1
            feed.id = self._feed_seq
        self.feeds[feed.id] = feed
        return feed

    def get_feed(self, feed_id: int) -> Feed | None:
        return self.feeds.get(feed_id)

    def list_feeds(self) -> list[Feed]:
        return list(self.feeds.values())

    def upsert_offer(self, offer: Offer) -> Offer:
        key = (offer.feed_id, offer.external_id)
        existing_id = self._offer_ids.get(key)
        if existing_id is not None:
            current = self.offers[existing_id]
            offer.id = existing_id
            # Сохраняем исходный id и обновляем остальные поля.
            self.offers[existing_id] = offer
            return offer
        if offer.id is None:
            offer.id = str(uuid.uuid4())
        self._offer_ids[key] = offer.id
        self.offers[offer.id] = offer
        return offer

    def get_offer(self, offer_id: str) -> Offer | None:
        return self.offers.get(offer_id)

    def find_offer(self, feed_id: int, external_id: str) -> Offer | None:
        offer_id = self._offer_ids.get((feed_id, external_id))
        return self.offers.get(offer_id) if offer_id else None

    def update_category(
        self, offer_id: str, category: str | None, supplier_category_id: str | None
    ) -> None:
        offer = self.offers.get(offer_id)
        if offer is not None:
            offer.category = category
            offer.supplier_category_id = supplier_category_id

    def upsert_categories(self, rows: list[dict]) -> None:
        for row in rows:
            self.categories[(row["feed_id"], row["external_id"])] = row

    def list_without_embedding(
        self, limit: int = 100, feed_id: int | None = None, category: str | None = None
    ) -> list[Offer]:
        embedded = {offer_id for (offer_id, _model) in self.embeddings}
        out = [
            o
            for o in self.offers.values()
            if o.id not in embedded
            and (feed_id is None or o.feed_id == feed_id)
            and (category is None or o.category == category)
        ]
        return out[: max(0, limit)]

    def list_without_color(
        self, limit: int = 100, feed_id: int | None = None, category: str | None = None
    ) -> list[Offer]:
        out = [
            o
            for o in self.offers.values()
            if not o.color_hist
            and (feed_id is None or o.feed_id == feed_id)
            and (category is None or o.category == category)
        ]
        return out[: max(0, limit)]

    def set_color(self, offer_id: str, hist: list[float]) -> None:
        offer = self.offers.get(offer_id)
        if offer is not None:
            offer.color_hist = list(hist)

    def put_embedding(
        self, offer_id: str, model: str, dim: int, embedding: list[float]
    ) -> None:
        self.embeddings[(offer_id, model)] = (dim, vectors.normalize(embedding))

    def delete_embeddings(self, offer_id: str) -> None:
        for key in [k for k in self.embeddings if k[0] == offer_id]:
            del self.embeddings[key]

    def search(
        self,
        embedding: list[float],
        filters: dict,
        top_k: int,
        min_score: float,
    ) -> list[tuple[Offer, float]]:
        filters = filters or {}
        categories = filters.get("categories")
        price_min = filters.get("price_min")
        price_max = filters.get("price_max")
        merchant = filters.get("merchant")
        scored: list[tuple[Offer, float]] = []
        for (offer_id, _model), (_dim, vec) in self.embeddings.items():
            offer = self.offers.get(offer_id)
            if offer is None:
                continue
            if categories and offer.category not in categories:
                continue
            if price_min is not None and (
                offer.price is None or offer.price < price_min
            ):
                continue
            if price_max is not None and (
                offer.price is None or offer.price > price_max
            ):
                continue
            if merchant and offer.merchant != merchant:
                continue
            try:
                score = vectors.cosine(embedding, vec)
            except ValueError:
                continue
            if score < min_score:
                continue
            scored.append((offer, score))
        scored.sort(key=lambda item: item[1], reverse=True)
        return scored[: max(0, top_k)]

    def search_text(self, query, filters, product, top_k=50):
        filters = filters or {}
        categories = filters.get("categories")
        price_min = filters.get("price_min")
        price_max = filters.get("price_max")
        merchant = filters.get("merchant")
        tokens = [attributes.stem(t) for t in attributes._norm(query).split() if len(t) >= 3]
        scored = []
        for offer in self.offers.values():
            if categories and offer.category not in categories:
                continue
            if price_min is not None and (
                offer.price is None or offer.price < price_min
            ):
                continue
            if price_max is not None and (
                offer.price is None or offer.price > price_max
            ):
                continue
            if merchant and offer.merchant != merchant:
                continue
            text = attributes._norm(
                " ".join(
                    [
                        offer.name,
                        offer.description or "",
                        offer.category_raw or "",
                        json.dumps(offer.params or {}, ensure_ascii=False),
                    ]
                )
            )
            hits = sum(1 for token in tokens if token in text)
            name_text = attributes._norm(offer.name)
            name_hits = sum(1 for token in tokens if token in name_text)
            if tokens and hits == 0:
                continue
            overall = hits / len(tokens) if tokens else 0.0
            name_score = name_hits / len(tokens) if tokens else 0.0
            keyword_score = 0.7 * name_score + 0.3 * overall
            attr_score = attributes.attribute_score(product, offer) if product else 0.0
            scored.append((offer, 0.6 * keyword_score + 0.4 * attr_score))
        scored.sort(key=lambda item: item[1], reverse=True)
        return scored[: max(0, top_k)]
