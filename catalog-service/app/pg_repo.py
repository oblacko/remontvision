"""PostgreSQL-репозиторий каталога (pgvector). psycopg импортируется лениво."""

from __future__ import annotations

import json
import pathlib
import threading
import uuid

from . import attributes, vectors
from .models import Feed, Offer

SCHEMA_PATH = pathlib.Path(__file__).resolve().parent.parent / "sql" / "001_schema.sql"
SQL_DIR = pathlib.Path(__file__).resolve().parent.parent / "sql"


def _vec_literal(vec: list[float]) -> str:
    return "[" + ",".join(repr(float(v)) for v in vec) + "]"


def _offer_from_row(row: dict) -> Offer:
    return Offer(
        id=str(row["id"]),
        feed_id=row["feed_id"],
        external_id=row["external_id"],
        merchant=row.get("merchant"),
        category=row.get("category"),
        category_raw=row.get("category_raw"),
        name=row["name"],
        vendor=row.get("vendor"),
        model=row.get("model"),
        description=row.get("description"),
        price=None if row.get("price") is None else float(row["price"]),
        old_price=None if row.get("old_price") is None else float(row["old_price"]),
        currency=row.get("currency") or "RUB",
        availability=row.get("availability") or "unknown",
        picture_url=row.get("picture_url"),
        picture_path=row.get("picture_path"),
        canonical_url=row.get("canonical_url"),
        affiliate_url=row.get("affiliate_url"),
        erid=row.get("erid"),
        params=row.get("params") or {},
        raw=row.get("raw") or {},
        status=row.get("status") or "active",
        content_hash=row.get("content_hash"),
        color_hist=row.get("color_hist"),
        supplier_category_id=row.get("supplier_category_id"),
    )


def _feed_from_row(row: dict) -> Feed:
    return Feed(
        id=row["id"],
        name=row["name"],
        url=row["url"],
        format=row.get("format") or "yml",
        adapter=row.get("adapter") or "pampadu_yml",
        active=bool(row.get("active", True)),
        last_synced_at=row.get("last_synced_at"),
        offer_count=row.get("offer_count") or 0,
        error=row.get("error"),
        root_category_id=row.get("root_category_id"),
    )


class PgOfferRepository:
    def __init__(self, dsn: str, dim: int = 1280):
        self.dsn = dsn
        self.dim = dim
        self._conn = None
        self._lock = threading.Lock()

    def _connection(self):
        import psycopg  # ленивый импорт: тесты идут с MemoryOfferRepository
        from psycopg.rows import dict_row

        if self._conn is None or self._conn.closed:
            self._conn = psycopg.connect(
                self.dsn, autocommit=True, row_factory=dict_row
            )
        return self._conn

    def _exec(self, sql: str, params=None):
        import psycopg

        with self._lock:
            for attempt in (1, 2):
                try:
                    conn = self._connection()
                    with conn.cursor() as cur:
                        cur.execute(sql, params or ())
                        if cur.description:
                            return cur.fetchall()
                        return []
                except (psycopg.OperationalError, psycopg.InterfaceError):
                    self._drop_connection()
                    if attempt == 2:
                        raise
        return []

    def _executemany(self, sql: str, rows: list[tuple]) -> None:
        import psycopg

        with self._lock:
            for attempt in (1, 2):
                try:
                    conn = self._connection()
                    with conn.cursor() as cur:
                        cur.executemany(sql, rows)
                    return
                except (psycopg.OperationalError, psycopg.InterfaceError):
                    self._drop_connection()
                    if attempt == 2:
                        raise

    def _drop_connection(self) -> None:
        try:
            if self._conn is not None:
                self._conn.close()
        except Exception:  # noqa: BLE001
            pass
        self._conn = None

    def init_schema(self) -> None:
        if not SQL_DIR.exists():
            return
        # В файлах нет dollar-quoted блоков, поэтому безопасно режем по ';'.
        for path in sorted(SQL_DIR.glob("*.sql")):
            for statement in path.read_text(encoding="utf-8").split(";"):
                stmt = statement.strip()
                if stmt:
                    self._exec(stmt)

    def upsert_feed(self, feed: Feed) -> Feed:
        if feed.id is None:
            rows = self._exec(
                """INSERT INTO feeds (name, url, format, adapter, active, root_category_id)
                   VALUES (%s,%s,%s,%s,%s,%s) RETURNING *""",
                (
                    feed.name,
                    feed.url,
                    feed.format,
                    feed.adapter,
                    feed.active,
                    feed.root_category_id,
                ),
            )
        else:
            rows = self._exec(
                """UPDATE feeds SET name=%s, url=%s, format=%s, adapter=%s, active=%s,
                          offer_count=%s, error=%s, last_synced_at=%s, root_category_id=%s
                   WHERE id=%s RETURNING *""",
                (
                    feed.name,
                    feed.url,
                    feed.format,
                    feed.adapter,
                    feed.active,
                    feed.offer_count,
                    feed.error,
                    feed.last_synced_at,
                    feed.root_category_id,
                    feed.id,
                ),
            )
        saved = _feed_from_row(rows[0])
        feed.id = saved.id
        return saved

    def get_feed(self, feed_id: int) -> Feed | None:
        rows = self._exec("SELECT * FROM feeds WHERE id=%s", (feed_id,))
        return _feed_from_row(rows[0]) if rows else None

    def list_feeds(self) -> list[Feed]:
        return [
            _feed_from_row(r) for r in self._exec("SELECT * FROM feeds ORDER BY id")
        ]

    def upsert_offer(self, offer: Offer) -> Offer:
        offer.id = offer.id or str(uuid.uuid4())
        rows = self._exec(
            """INSERT INTO offers
                 (id, feed_id, external_id, merchant, category, category_raw, name, vendor,
                  model, description, price, old_price, currency, availability, picture_url,
                  picture_path, canonical_url, affiliate_url, erid, params, raw, status,
                  content_hash, supplier_category_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (feed_id, external_id) DO UPDATE SET
                 merchant=EXCLUDED.merchant, category=EXCLUDED.category,
                 category_raw=EXCLUDED.category_raw, name=EXCLUDED.name, vendor=EXCLUDED.vendor,
                 model=EXCLUDED.model, description=EXCLUDED.description, price=EXCLUDED.price,
                 old_price=EXCLUDED.old_price, currency=EXCLUDED.currency,
                 availability=EXCLUDED.availability, picture_url=EXCLUDED.picture_url,
                 picture_path=EXCLUDED.picture_path, canonical_url=EXCLUDED.canonical_url,
                 affiliate_url=EXCLUDED.affiliate_url, erid=EXCLUDED.erid, params=EXCLUDED.params,
                 raw=EXCLUDED.raw, status=EXCLUDED.status, content_hash=EXCLUDED.content_hash,
                 supplier_category_id=EXCLUDED.supplier_category_id,
                 updated_at=now()
               RETURNING *""",
            (
                offer.id,
                offer.feed_id,
                offer.external_id,
                offer.merchant,
                offer.category,
                offer.category_raw,
                offer.name,
                offer.vendor,
                offer.model,
                offer.description,
                offer.price,
                offer.old_price,
                offer.currency,
                offer.availability,
                offer.picture_url,
                offer.picture_path,
                offer.canonical_url,
                offer.affiliate_url,
                offer.erid,
                json.dumps(offer.params or {}),
                json.dumps(offer.raw or {}),
                offer.status,
                offer.content_hash,
                offer.supplier_category_id,
            ),
        )
        saved = _offer_from_row(rows[0])
        offer.id = saved.id
        return saved

    def update_category(
        self, offer_id: str, category: str | None, supplier_category_id: str | None
    ) -> None:
        self._exec(
            "UPDATE offers SET category=%s, supplier_category_id=%s WHERE id=%s",
            (category, supplier_category_id, offer_id),
        )

    def upsert_categories(self, rows: list[dict]) -> None:
        if not rows:
            return
        self._executemany(
            """INSERT INTO categories
                 (feed_id, external_id, name, parent_external_id, path, internal_category)
               VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT (feed_id, external_id) DO UPDATE SET
                 name=EXCLUDED.name, parent_external_id=EXCLUDED.parent_external_id,
                 path=EXCLUDED.path, internal_category=EXCLUDED.internal_category""",
            [
                (
                    row["feed_id"],
                    row["external_id"],
                    row["name"],
                    row["parent_external_id"],
                    row["path"],
                    row["internal_category"],
                )
                for row in rows
            ],
        )

    def get_offer(self, offer_id: str) -> Offer | None:
        rows = self._exec("SELECT * FROM offers WHERE id=%s", (offer_id,))
        return _offer_from_row(rows[0]) if rows else None

    def find_offer(self, feed_id: int, external_id: str) -> Offer | None:
        rows = self._exec(
            "SELECT * FROM offers WHERE feed_id=%s AND external_id=%s",
            (feed_id, external_id),
        )
        return _offer_from_row(rows[0]) if rows else None

    def list_without_embedding(
        self, limit: int = 100, feed_id: int | None = None, category: str | None = None
    ) -> list[Offer]:
        rows = self._exec(
            """SELECT o.* FROM offers o
               LEFT JOIN offer_embeddings e ON e.offer_id = o.id
               WHERE e.offer_id IS NULL AND o.status = 'active'
                 AND (%s::bigint IS NULL OR o.feed_id = %s::bigint)
                 AND (%s::text IS NULL OR o.category = %s::text)
               ORDER BY (o.picture_url IS NULL) ASC, o.created_at ASC LIMIT %s""",
            (feed_id, feed_id, category, category, limit),
        )
        return [_offer_from_row(r) for r in rows]

    def list_without_color(
        self, limit: int = 100, feed_id: int | None = None, category: str | None = None
    ) -> list[Offer]:
        rows = self._exec(
            """SELECT * FROM offers
               WHERE color_hist IS NULL AND status = 'active'
                 AND (%s::bigint IS NULL OR feed_id = %s::bigint)
                 AND (%s::text IS NULL OR category = %s::text)
               ORDER BY (picture_url IS NULL) ASC, created_at ASC LIMIT %s""",
            (feed_id, feed_id, category, category, limit),
        )
        return [_offer_from_row(r) for r in rows]

    def set_color(self, offer_id: str, hist: list[float]) -> None:
        self._exec("UPDATE offers SET color_hist=%s WHERE id=%s", (hist, offer_id))

    def put_embedding(
        self, offer_id: str, model: str, dim: int, embedding: list[float]
    ) -> None:
        vec = _vec_literal(vectors.normalize(embedding))
        self._exec(
            """INSERT INTO offer_embeddings (offer_id, model, dim, embedding)
               VALUES (%s,%s,%s,%s::vector)
               ON CONFLICT (offer_id, model) DO UPDATE SET
                 dim=EXCLUDED.dim, embedding=EXCLUDED.embedding, created_at=now()""",
            (offer_id, model, dim, vec),
        )

    def delete_embeddings(self, offer_id: str) -> None:
        self._exec("DELETE FROM offer_embeddings WHERE offer_id=%s", (offer_id,))

    def search(self, embedding, filters, top_k, min_score):
        filters = filters or {}
        vec = _vec_literal(vectors.normalize(embedding))
        categories = filters.get("categories") or None
        price_min = filters.get("price_min")
        price_max = filters.get("price_max")
        merchant = filters.get("merchant")
        params = [
            categories,
            categories,
            price_min,
            price_min,
            price_max,
            price_max,
            merchant,
            merchant,
            vec,
            min_score,
            vec,
            top_k,
        ]
        rows = self._exec(
            """SELECT o.*, 1 - (e.embedding <=> %s::vector) AS score
               FROM offer_embeddings e JOIN offers o ON o.id = e.offer_id
               WHERE (%s::text[] IS NULL OR o.category = ANY(%s::text[]))
                 AND (%s::numeric IS NULL OR o.price >= %s::numeric)
                 AND (%s::numeric IS NULL OR o.price <= %s::numeric)
                 AND (%s::text IS NULL OR o.merchant = %s::text)
                 AND (1 - (e.embedding <=> %s::vector)) >= %s
               ORDER BY e.embedding <=> %s::vector
               LIMIT %s""",
            (
                vec,
                categories,
                categories,
                price_min,
                price_min,
                price_max,
                price_max,
                merchant,
                merchant,
                vec,
                min_score,
                vec,
                top_k,
            ),
        )
        return [(_offer_from_row(r), float(r["score"])) for r in rows]

    def search_text(self, query, filters, product, top_k=50):
        filters = filters or {}
        categories = filters.get("categories") or None
        price_min = filters.get("price_min")
        price_max = filters.get("price_max")
        merchant = filters.get("merchant")
        tokens = [
            attributes.stem(t) for t in attributes._norm(query).split() if len(t) >= 3
        ]
        where = ["status = 'active'"]
        params: list = []
        if categories:
            where.append("category = ANY(%s)")
            params.append(categories)
        if price_min is not None:
            where.append("price >= %s")
            params.append(price_min)
        if price_max is not None:
            where.append("price <= %s")
            params.append(price_max)
        if merchant:
            where.append("merchant = %s")
            params.append(merchant)
        if tokens:
            ors = []
            for token in tokens:
                ors.append(
                    "(name ILIKE %s OR description ILIKE %s OR category_raw ILIKE %s OR params::text ILIKE %s)"
                )
                params.extend([f"%{token}%"] * 4)
            where.append("(" + " OR ".join(ors) + ")")
        order = ""
        if tokens:
            order = "(name ILIKE %s) DESC, "
            params.append(f"%{tokens[0]}%")
        sql = (
            "SELECT * FROM offers WHERE "
            + " AND ".join(where)
            + " ORDER BY "
            + order
            + "created_at DESC LIMIT 5000"
        )
        rows = self._exec(sql, params)
        scored = []
        for row in rows:
            offer = _offer_from_row(row)
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
            keyword_score = (
                sum(1 for token in tokens if token in text) / len(tokens)
                if tokens
                else 0.0
            )
            name_text = attributes._norm(offer.name)
            hits = sum(1 for token in tokens if token in text)
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
