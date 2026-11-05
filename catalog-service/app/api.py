"""HTTP API каталог-сервиса."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time
import uuid
from datetime import datetime, timezone

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from . import feed as feed_parser
from . import imaging, pipeline, search
from .config import Settings, get_settings
from .embedder import get_embedder
from .httpguard import is_public_http_url
from .memory_repo import MemoryOfferRepository
from .models import Feed, Offer
from .ui import INDEX_HTML


class FeedIn(BaseModel):
    name: str
    url: str
    format: str = "yml"
    adapter: str = "pampadu_yml"
    root_category_id: str | None = None


class FeedPatch(BaseModel):
    name: str | None = None
    url: str | None = None
    active: bool | None = None
    root_category_id: str | None = None


class EmbedIn(BaseModel):
    feed_id: int | None = None
    category: str | None = None


class FiltersIn(BaseModel):
    categories: list[str] | None = None
    price_min: float | None = None
    price_max: float | None = None
    merchant: str | None = None


class ProductIn(BaseModel):
    label: str | None = None
    description: str | None = None
    color: str | None = None
    material: str | None = None
    size: str | None = None
    category: str | None = None
    product_type: str | None = None
    search_query: str | None = None
    hex: str | None = None


class SearchIn(BaseModel):
    image_b64: str | None = None
    text: str | None = None
    filters: FiltersIn = Field(default_factory=FiltersIn)
    product: ProductIn | None = None
    top_k: int = 10
    min_score: float = 0.0


class SearchTextIn(BaseModel):
    query: str = ""
    filters: FiltersIn = Field(default_factory=FiltersIn)
    product: ProductIn | None = None
    top_k: int = 20


class SegmentIn(BaseModel):
    image_b64: str
    k: int = 8


class GridAiIn(BaseModel):
    image_b64: str
    verify: bool = True
    objects: list[dict] | None = None


class VisionIn(BaseModel):
    image_b64: str


class VisionSearchIn(BaseModel):
    image_b64: str
    top_k: int = 5


class VisionAgentIn(BaseModel):
    image_b64: str
    room_type: str = ""
    style: str = ""
    top_k: int = 5
    max_steps: int = 10
    mime: str = "image/jpeg"


class SegmentHeadIn(BaseModel):
    image_b64: str
    max_items: int = 15


class MaskAtIn(BaseModel):
    image_b64: str
    x: float
    y: float


def _decode_image(image_b64: str) -> bytes:
    try:
        data = base64.b64decode(image_b64)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Некорректный image_b64")
    if not data:
        raise HTTPException(status_code=400, detail="Пустая картинка")
    return data


def _feed_dict(feed: Feed) -> dict:
    return {
        "id": feed.id,
        "name": feed.name,
        "url": feed.url,
        "format": feed.format,
        "adapter": feed.adapter,
        "active": feed.active,
        "last_synced_at": feed.last_synced_at,
        "offer_count": feed.offer_count,
        "error": feed.error,
        "root_category_id": feed.root_category_id,
    }


def _offer_dict(offer: Offer) -> dict:
    return {
        "id": offer.id,
        "feed_id": offer.feed_id,
        "external_id": offer.external_id,
        "merchant": offer.merchant,
        "category": offer.category,
        "category_raw": offer.category_raw,
        "name": offer.name,
        "vendor": offer.vendor,
        "model": offer.model,
        "price": offer.price,
        "old_price": offer.old_price,
        "currency": offer.currency,
        "availability": offer.availability,
        "picture_url": offer.picture_url,
        "canonical_url": offer.canonical_url,
        "affiliate_url": offer.affiliate_url,
        "erid": offer.erid,
        "params": offer.params,
        "status": offer.status,
    }


def default_fetcher(settings: Settings):
    def fetch(url: str) -> bytes:
        if not is_public_http_url(url):
            raise ValueError("URL не публичный")
        resp = httpx.get(url, timeout=settings.http_timeout_s, follow_redirects=True)
        resp.raise_for_status()
        if len(resp.content) > settings.max_feed_bytes:
            raise ValueError("Ответ больше лимита")
        return resp.content

    return fetch


def save_query_image(image_bytes: bytes) -> str | None:
    """Сохраняет присланную картинку запроса для разбора (последние 200)."""
    query_dir = os.environ.get("QUERY_DIR", "/app/data/queries")
    try:
        os.makedirs(query_dir, exist_ok=True)
        digest = hashlib.sha256(image_bytes).hexdigest()[:12]
        name = f"{int(time.time())}_{digest}.jpg"
        path = os.path.join(query_dir, name)
        with open(path, "wb") as fh:
            fh.write(image_bytes)
        files = sorted(
            (f for f in os.listdir(query_dir) if f.endswith(".jpg")),
            key=lambda f: os.path.getmtime(os.path.join(query_dir, f)),
            reverse=True,
        )
        for old in files[200:]:
            try:
                os.remove(os.path.join(query_dir, old))
            except OSError:
                pass
        return path
    except OSError:
        return None


def create_app(
    settings: Settings | None = None,
    repo=None,
    embedder=None,
    fetcher=None,
) -> FastAPI:
    settings = settings or get_settings()
    if repo is None:
        if settings.database_url:
            from .pg_repo import PgOfferRepository

            repo = PgOfferRepository(settings.database_url, dim=settings.embed_dim)
            repo.init_schema()
        else:
            repo = MemoryOfferRepository()
    embedder = embedder if embedder is not None else get_embedder(settings)
    fetcher = fetcher if fetcher is not None else default_fetcher(settings)
    image_fetcher = pipeline.caching_fetcher(
        fetcher, os.environ.get("IMAGE_CACHE_DIR", "/app/data/images")
    )

    app = FastAPI(title="catalog-service")
    app.state.repo = repo
    app.state.embedder = embedder
    app.state.jobs = {}

    def verify_token(
        x_catalog_token: str | None = Header(default=None, alias="X-Catalog-Token"),
    ):
        if not settings.catalog_token:
            return
        if not x_catalog_token or not hmac.compare_digest(
            x_catalog_token, settings.catalog_token
        ):
            raise HTTPException(status_code=401, detail="Invalid token")

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "embedder": settings.embedder,
            "model": embedder.model,
            "dim": embedder.dim,
            "color_rerank_weight": settings.color_rerank_weight,
        }

    @app.get("/", response_class=HTMLResponse)
    def index():
        # Страница сама спрашивает токен и вызывает /search; публичный только HTML.
        return INDEX_HTML

    @app.get("/models", dependencies=[Depends(verify_token)])
    def models():
        return {
            "model": embedder.model,
            "dim": embedder.dim,
            "embedder": settings.embedder,
        }

    @app.get("/categories", dependencies=[Depends(verify_token)])
    def list_categories():
        from .categories import INTERNAL_LABELS

        return [{"key": key, "label": label} for key, label in INTERNAL_LABELS.items()]

    @app.post("/feeds", dependencies=[Depends(verify_token)])
    def create_feed(body: FeedIn):
        saved = repo.upsert_feed(
            Feed(
                name=body.name,
                url=body.url,
                format=body.format,
                adapter=body.adapter,
                root_category_id=body.root_category_id,
            )
        )
        return _feed_dict(saved)

    @app.get("/feeds", dependencies=[Depends(verify_token)])
    def list_feeds():
        return [_feed_dict(f) for f in repo.list_feeds()]

    @app.patch("/feeds/{feed_id}", dependencies=[Depends(verify_token)])
    def patch_feed(feed_id: int, body: FeedPatch):
        feed = repo.get_feed(feed_id)
        if not feed:
            raise HTTPException(status_code=404, detail="Feed not found")
        for key, value in body.model_dump(exclude_unset=True).items():
            setattr(feed, key, value)
        return _feed_dict(repo.upsert_feed(feed))

    def run_feed(feed: Feed, embed: bool, job_id: str):
        try:
            raw = fetcher(feed.url)
            category_rows = feed_parser.parse_categories(raw, feed.id)
            repo.upsert_categories(category_rows)
            parsed = feed_parser.parse_yml(
                raw, source_url=feed.url, root_category_id=feed.root_category_id
            )
            imported = pipeline.import_offers(repo, feed.id, parsed)
            result = {
                "status": "done",
                "created": imported.created,
                "updated": imported.updated,
                "unchanged": imported.unchanged,
            }
            if embed:
                embedded = pipeline.embed_all(
                    repo,
                    embedder,
                    image_fetcher,
                    concurrency=settings.embed_concurrency,
                    feed_id=feed.id,
                )
                colored = pipeline.backfill_all_colors(
                    repo,
                    image_fetcher,
                    concurrency=settings.embed_concurrency,
                    feed_id=feed.id,
                )
                result.update(
                    embedded=embedded.embedded,
                    skipped=embedded.skipped,
                    failed=embedded.failed,
                    colored=colored.colored,
                    color_failed=colored.failed,
                )
            feed.offer_count = len(parsed)
            feed.error = None
            feed.last_synced_at = datetime.now(timezone.utc).isoformat()
            repo.upsert_feed(feed)
            app.state.jobs[job_id] = result
        except Exception as exc:  # noqa: BLE001
            feed.error = str(exc)[:300]
            repo.upsert_feed(feed)
            app.state.jobs[job_id] = {"status": "failed", "error": str(exc)[:300]}

    def run_embed(feed: Feed | None, category: str | None, job_id: str):
        try:
            embedded = pipeline.embed_all(
                repo,
                embedder,
                image_fetcher,
                concurrency=settings.embed_concurrency,
                feed_id=feed.id if feed else None,
                category=category,
            )
            colored = pipeline.backfill_all_colors(
                repo,
                image_fetcher,
                concurrency=settings.embed_concurrency,
                feed_id=feed.id if feed else None,
                category=category,
            )
            app.state.jobs[job_id] = {
                "status": "done",
                "embedded": embedded.embedded,
                "skipped": embedded.skipped,
                "failed": embedded.failed,
                "colored": colored.colored,
                "color_failed": colored.failed,
            }
        except Exception as exc:  # noqa: BLE001
            app.state.jobs[job_id] = {"status": "failed", "error": str(exc)[:300]}

    def start_job(background: BackgroundTasks, fn, *args):
        job_id = uuid.uuid4().hex
        app.state.jobs[job_id] = {"status": "queued"}
        background.add_task(fn, *args, job_id)
        return {"job_id": job_id, "status": "queued"}

    @app.post("/feeds/{feed_id}/sync", dependencies=[Depends(verify_token)])
    def sync_feed(feed_id: int, background: BackgroundTasks):
        feed = repo.get_feed(feed_id)
        if not feed:
            raise HTTPException(status_code=404, detail="Feed not found")
        return start_job(background, run_feed, feed, True)

    @app.post("/feeds/{feed_id}/import", dependencies=[Depends(verify_token)])
    def import_feed(feed_id: int, background: BackgroundTasks):
        feed = repo.get_feed(feed_id)
        if not feed:
            raise HTTPException(status_code=404, detail="Feed not found")
        return start_job(background, run_feed, feed, False)

    @app.post("/feeds/{feed_id}/embed", dependencies=[Depends(verify_token)])
    def embed_feed(feed_id: int, background: BackgroundTasks):
        feed = repo.get_feed(feed_id)
        if not feed:
            raise HTTPException(status_code=404, detail="Feed not found")
        return start_job(background, run_embed, feed, None)

    @app.post("/embed", dependencies=[Depends(verify_token)])
    def embed_all_feeds(background: BackgroundTasks, body: EmbedIn | None = None):
        feed = None
        if body and body.feed_id is not None:
            feed = repo.get_feed(body.feed_id)
            if not feed:
                raise HTTPException(status_code=404, detail="Feed not found")
        category = body.category if body else None
        return start_job(background, run_embed, feed, category)

    @app.get("/feeds/{feed_id}/status", dependencies=[Depends(verify_token)])
    def feed_status(feed_id: int):
        feed = repo.get_feed(feed_id)
        if not feed:
            raise HTTPException(status_code=404, detail="Feed not found")
        last = None
        if app.state.jobs:
            last = list(app.state.jobs.values())[-1]
        return {"feed": _feed_dict(feed), "last_job": last}

    @app.post("/segment", dependencies=[Depends(verify_token)])
    def segment_endpoint(body: SegmentIn):
        image_bytes = _decode_image(body.image_b64)
        patch_features = getattr(embedder, "patch_features", None)
        if patch_features is None:
            raise HTTPException(
                status_code=400,
                detail="Сегментация доступна только с EMBEDDER=torch",
            )
        items = imaging.segments(image_bytes, patch_features, k=max(2, min(16, body.k)))
        return {"items": items, "mode": "segment"}

    @app.post("/grid-ai", dependencies=[Depends(verify_token)])
    def grid_ai_endpoint(body: GridAiIn):
        image_bytes = _decode_image(body.image_b64)
        from . import gridai

        try:
            items = gridai.generate_products(
                image_bytes, verify=body.verify, objects=body.objects
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=503, detail=f"AI-сетка недоступна: {exc}")
        return {"items": items, "mode": "grid-ai"}

    @app.post("/vision", dependencies=[Depends(verify_token)])
    def vision_endpoint(body: VisionIn):
        image_bytes = _decode_image(body.image_b64)
        from . import gridai

        try:
            return gridai.vision_full(image_bytes)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=503, detail=f"Vision недоступен: {exc}")

    @app.post("/vision-search", dependencies=[Depends(verify_token)])
    def vision_search_endpoint(body: VisionSearchIn):
        image_bytes = _decode_image(body.image_b64)
        try:
            return search.vision_search(
                repo, image_bytes, top_k=max(1, min(20, body.top_k))
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=503, detail=f"Vision-поиск недоступен: {exc}"
            )

    @app.post("/vision-agent", dependencies=[Depends(verify_token)])
    def vision_agent_endpoint(body: VisionAgentIn):
        image_bytes = _decode_image(body.image_b64)
        from . import vision_agent

        try:
            return vision_agent.run_image(
                image_bytes,
                mime=body.mime or "image/jpeg",
                room_type=body.room_type,
                style=body.style,
                top_k=max(1, min(20, body.top_k)),
                max_steps=max(1, min(14, body.max_steps)),
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=503, detail=f"Vision-агент недоступен: {exc}"
            )

    @app.post("/segment-head", dependencies=[Depends(verify_token)])
    def segment_head_endpoint(body: SegmentHeadIn):
        image_bytes = _decode_image(body.image_b64)
        from . import segmentation_head

        try:
            result = segmentation_head.segment(
                image_bytes, embedder, max_items=max(1, min(30, body.max_items))
            )
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=503, detail=f"Сегментация недоступна: {exc}"
            )
        return {**result, "mode": "segment-head"}

    @app.post("/mask-at", dependencies=[Depends(verify_token)])
    def mask_at_endpoint(body: MaskAtIn):
        image_bytes = _decode_image(body.image_b64)
        from . import segmentation_head

        try:
            result = segmentation_head.mask_at(image_bytes, embedder, body.x, body.y)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=503, detail=f"Маска недоступна: {exc}")
        return result

    @app.post("/search", dependencies=[Depends(verify_token)])
    def search_endpoint(body: SearchIn):
        image_bytes = None
        if body.image_b64:
            try:
                image_bytes = base64.b64decode(body.image_b64)
            except (ValueError, TypeError):
                raise HTTPException(status_code=400, detail="Некорректный image_b64")
        saved_query = save_query_image(image_bytes) if image_bytes else None
        filters = search.SearchFilters(
            categories=body.filters.categories,
            price_min=body.filters.price_min,
            price_max=body.filters.price_max,
            merchant=body.filters.merchant,
        )
        try:
            results = search.search_offers(
                repo,
                embedder,
                image_bytes=image_bytes,
                text=body.text,
                filters=filters,
                top_k=body.top_k,
                min_score=body.min_score,
                color_weight=settings.color_rerank_weight,
                rerank_pool=settings.color_rerank_pool,
                product=body.product.model_dump() if body.product else None,
                attr_weight=settings.attr_rerank_weight,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        return {
            "results": results,
            "query_saved": saved_query,
            "model": embedder.model,
            "dim": embedder.dim,
            "query": {
                "product": body.product.model_dump() if body.product else None,
                "filters": body.filters.model_dump(),
                "color_weight": settings.color_rerank_weight,
                "attr_weight": settings.attr_rerank_weight,
                "top_k": body.top_k,
            },
        }

    @app.post("/search-text", dependencies=[Depends(verify_token)])
    def search_text_endpoint(body: SearchTextIn):
        filters = search.SearchFilters(
            categories=body.filters.categories,
            price_min=body.filters.price_min,
            price_max=body.filters.price_max,
            merchant=body.filters.merchant,
        )
        results = search.search_by_keywords(
            repo,
            query=body.query,
            filters=filters,
            product=body.product.model_dump() if body.product else None,
            top_k=body.top_k,
        )
        return {
            "results": results,
            "query": {
                "query": body.query,
                "product": body.product.model_dump() if body.product else None,
                "filters": body.filters.model_dump(),
                "top_k": body.top_k,
            },
        }

    @app.get("/offers/{offer_id}", dependencies=[Depends(verify_token)])
    def get_offer(offer_id: str):
        offer = repo.get_offer(offer_id)
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found")
        return _offer_dict(offer)

    return app
