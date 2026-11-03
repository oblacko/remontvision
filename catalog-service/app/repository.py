"""Интерфейс репозитория каталога (реализации: memory и Postgres)."""

from __future__ import annotations

from typing import Protocol

from .models import Feed, Offer


class OfferRepository(Protocol):
    def upsert_feed(self, feed: Feed) -> Feed: ...

    def get_feed(self, feed_id: int) -> Feed | None: ...

    def list_feeds(self) -> list[Feed]: ...

    def upsert_offer(self, offer: Offer) -> Offer: ...

    def get_offer(self, offer_id: str) -> Offer | None: ...

    def find_offer(self, feed_id: int, external_id: str) -> Offer | None: ...

    def list_without_embedding(self, limit: int = 100) -> list[Offer]: ...

    def list_without_color(self, limit: int = 100) -> list[Offer]: ...

    def set_color(self, offer_id: str, hist: list[float]) -> None: ...

    def put_embedding(
        self, offer_id: str, model: str, dim: int, embedding: list[float]
    ) -> None: ...

    def delete_embeddings(self, offer_id: str) -> None: ...

    def search(
        self,
        embedding: list[float],
        filters: dict,
        top_k: int,
        min_score: float,
    ) -> list[tuple[Offer, float]]: ...
