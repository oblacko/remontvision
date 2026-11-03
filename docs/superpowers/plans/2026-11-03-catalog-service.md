# Catalog Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Python catalog service that imports CPA YML feeds, stores normalized offers, vectorizes product images with DINOv2, and serves vector similarity search; wire remontvision to use it as an additional search source.

**Architecture:** A FastAPI service with its own PostgreSQL+pgvector DB owns feed ingestion, offers, embeddings, and `/search`. Remontvision calls it live via `src/catalogclient.js`, merges catalog results with Yandex, and snapshots results into `search_results`.

**Tech Stack:** Python 3.12, FastAPI, Pydantic, SQLAlchemy/psycopg3, pgvector, torch + DINOv2 (lazy), pytest. Remontvision: Node 20, node:test.

**Spec:** `docs/superpowers/specs/2026-11-03-catalog-service-design.md`

## Global Constraints

- Python 3.12 in Docker; local tests must run WITHOUT torch (use `FakeEmbedder`).
- Embedding dimension is configurable (`EMBED_DIM`), never hardcoded in logic.
- pgvector column is `vector(1280)` per spec; `EMBED_DIM` must match in config.
- Only `http`/`https` feed/image URLs; reject private/loopback hosts (SSRF).
- Never fabricate URLs/prices/SKUs; preserve source `raw`.
- Always store `erid` and `affiliate_url`; never drop them.
- Remontvision: ESM, single quotes, no trailing commas style is not required; follow `AGENTS.md`.
- SQL only parameterized; migrations append-only.
- No secrets in git; `CATALOG_SERVICE_TOKEN` via env.
- Catalog service lives at `app/catalog-service/`.
- Internal endpoints require `X-Catalog-Token`; `/health` is public.

## Review Focus

- Feed with missing `<offers>` or malformed XML → parser must return empty list + clear error, not crash the sync.
- Offer with path-only `<picture>` or `<param>` pointing to a file path → must not be treated as a remote image URL.
- Offer URL with no `dl`/`erid` (plain URL) → `canonical_url` falls back to the URL, `erid` null; must not crash.
- Search when catalog has zero embeddings or DB unavailable → remontvision must fall back to Yandex results, not fail the whole search.
- Duplicate offer across re-sync with unchanged `content_hash` → embedding is not recomputed.
- Private/local image URL → refused by SSRF guard (no request made).

---

### Task 1: Service scaffold, config, vectors, embedder interface

**Files:**
- Create: `catalog-service/requirements.txt`
- Create: `catalog-service/pytest.ini`
- Create: `catalog-service/app/__init__.py`
- Create: `catalog-service/app/config.py`
- Create: `catalog-service/app/vectors.py`
- Create: `catalog-service/app/embedder.py`
- Test: `catalog-service/tests/test_vectors.py`
- Test: `catalog-service/tests/test_embedder.py`

**Interfaces:**
- Produces:
  - `config.Settings` dataclass with `database_url: str`, `catalog_token: str`, `embedder: str`, `embed_model: str`, `embed_dim: int`, `max_feed_bytes: int`, `http_timeout_s: float`; `config.get_settings() -> Settings`.
  - `vectors.normalize(vec: list[float]) -> list[float]`
  - `vectors.cosine(a, b) -> float`
  - `embedder.Embedder` protocol: `embed_image(image_bytes: bytes) -> list[float]`, `embed_text(text: str) -> list[float]`, `dim: int`, `model: str`
  - `embedder.FakeEmbedder(dim=1280, model='fake')` deterministic.
  - `embedder.get_embedder(settings) -> Embedder` returns FakeEmbedder when `settings.embedder == 'fake'`, else `TorchEmbedder` (torch imported lazily inside).

- [ ] **Step 1: Write failing tests**

`tests/test_vectors.py`:
```python
from app import vectors

def test_normalize_makes_unit_length():
    out = vectors.normalize([3.0, 4.0])
    assert abs((out[0] ** 2 + out[1] ** 2) - 1.0) < 1e-9

def test_normalize_zero_vector_is_safe():
    assert vectors.normalize([0.0, 0.0]) == [0.0, 0.0]

def test_cosine_identical_is_one():
    a = vectors.normalize([1.0, 2.0, 3.0])
    assert abs(vectors.cosine(a, a) - 1.0) < 1e-9
```

`tests/test_embedder.py`:
```python
from app.embedder import FakeEmbedder

def test_fake_embedder_is_deterministic_and_sized():
    e = FakeEmbedder(dim=16)
    a = e.embed_text('кровать беж')
    b = e.embed_text('кровать беж')
    assert len(a) == 16 and a == b

def test_fake_embedder_image_differs_by_bytes():
    e = FakeEmbedder(dim=16)
    assert e.embed_image(b'one') != e.embed_image(b'two')
```

- [ ] **Step 2: Run tests, verify they fail** — `cd catalog-service && python3 -m pytest -q` → import errors.

- [ ] **Step 3: Implement**

`app/vectors.py`: `math`-based L2 normalize (zero-safe) and cosine.
`app/embedder.py`: `FakeEmbedder` uses `hashlib.sha256` of input to seed a stable pseudo-random vector (e.g. derive floats from digest), then `normalize`. `TorchEmbedder` loads `torch` + `torch.hub.load('facebookresearch/dinov2', ...)` and dino.txt lazily in `__init__`.
`app/config.py`: `Settings` dataclass reading env with defaults: `RV_CATALOG_DATABASE_URL`/`CATALOG_DATABASE_URL`, `CATALOG_SERVICE_TOKEN`, `EMBEDDER` (default `fake`), `EMBED_MODEL` (default `dinov2_vitl14_reg4_dinotxt`), `EMBED_DIM` (default `1280`), `MAX_FEED_BYTES` (default `300000000`), `HTTP_TIMEOUT_S` (default `30`).

- [ ] **Step 4: Run tests, verify pass** — `python3 -m pytest -q`.

- [ ] **Step 5: Commit** — `git add catalog-service && git commit -m "feat(catalog): scaffold service, vectors, embedder"`.

---

### Task 2: Feed YML parser and category mapping

**Files:**
- Create: `catalog-service/app/categories.py`
- Create: `catalog-service/app/feed.py`
- Test: `catalog-service/tests/test_feed.py`
- Test fixture: `catalog-service/tests/fixtures/feed_min.xml`

**Interfaces:**
- Produces:
  - `categories.map_category(category_raw: str, name: str) -> str | None`
  - `feed.ParsedOffer` dataclass: `external_id, merchant, category, category_raw, name, vendor, model, description, price, old_price, currency, availability, picture_url, canonical_url, affiliate_url, erid, params: dict, raw: dict`
  - `feed.parse_yml(xml_bytes: bytes, *, source_url: str, merchant: str | None = None) -> list[ParsedOffer]`
  - `feed.decode_target_url(affiliate_url: str) -> tuple[str | None, str | None]` returning `(canonical_url, erid)`.

- [ ] **Step 1: Write fixture**

`tests/fixtures/feed_min.xml` with `<shop><categories>...</categories><offers>` containing one offer matching feed 789 shape: `id`, `available`, `price`, `oldprice`, `currencyId`, `categoryId`, tracking `url` with `erid` + `dl`, `picture`, `name`, `description`, `param name="Цвет"`.

- [ ] **Step 2: Write failing tests**

```python
from app import feed

def test_parse_yml_reads_offer_and_params():
    xml = open('tests/fixtures/feed_min.xml', 'rb').read()
    offers = feed.parse_yml(xml, source_url='https://example.test/feed')
    assert len(offers) == 1
    o = offers[0]
    assert o.external_id == '534277'
    assert o.price == 39700
    assert o.availability == 'in_stock'
    assert o.params.get('Цвет') == 'Латте'

def test_decode_target_url_extracts_canonical_and_erid():
    url = 'https://trk.ppdu.ru/click/X?erid=2SDabc&dl=https%3A%2F%2FDIVANBOSS.RU%2Fp%2F1'
    canonical, erid = feed.decode_target_url(url)
    assert erid == '2SDabc'
    assert canonical == 'https://DIVANBOSS.RU/p/1'

def test_plain_url_has_no_erid():
    canonical, erid = feed.decode_target_url('https://shop.test/item/1')
    assert canonical == 'https://shop.test/item/1'
    assert erid is None

def test_parse_empty_feed_returns_empty():
    assert feed.parse_yml(b'<yml_catalog><shop></shop></yml_catalog>', source_url='x') == []
```

- [ ] **Step 3: Run tests, verify fail.**

- [ ] **Step 4: Implement** with `xml.etree.ElementTree`; map `available in ('true','1')` → `in_stock`, else `out_of_stock`; category via `categories.map_category`; params flattened; `raw` = dict of scalar fields + params. `decode_target_url` parses query `erid` and `dl` (url-decode). `merchant` derived from `dl` host or passed.

- [ ] **Step 5: Run tests, verify pass.**

- [ ] **Step 6: Commit.**

---

### Task 3: Offers schema, repository interface, memory repo

**Files:**
- Create: `catalog-service/sql/001_schema.sql`
- Create: `catalog-service/app/models.py`
- Create: `catalog-service/app/repository.py`
- Create: `catalog-service/app/memory_repo.py`
- Test: `catalog-service/tests/test_memory_repo.py`

**Interfaces:**
- Produces:
  - `models.Offer` dataclass mirroring the `offers` table (id, feed_id, external_id, merchant, category, category_raw, name, vendor, model, description, price, old_price, currency, availability, picture_url, picture_path, canonical_url, affiliate_url, erid, params, raw, status, content_hash).
  - `repository.OfferRepository` protocol: `upsert_offer(offer) -> Offer`, `get_offer(id) -> Offer | None`, `list_without_embedding(limit) -> list[Offer]`, `put_embedding(offer_id, model, dim, embedding)`, `search(embedding, filters, top_k, min_score) -> list[tuple[Offer, float]]`, `upsert_feed(...)`, `get_feed(id)`, `list_feeds()`.
  - `memory_repo.MemoryOfferRepository` implementing all of the above (cosine in Python).

- [ ] **Step 1: Write failing tests**

```python
from app.memory_repo import MemoryOfferRepository
from app.models import Offer

def make_offer(eid='1', price=100, category='bed'):
    return Offer(id=None, feed_id=1, external_id=eid, merchant='m',
        category=category, category_raw='Кровати', name='k', vendor=None,
        model=None, description=None, price=price, old_price=None,
        currency='RUB', availability='in_stock', picture_url='p',
        picture_path=None, canonical_url='c', affiliate_url='a', erid='e',
        params={}, raw={}, status='active', content_hash='h')

def test_upsert_by_feed_and_external_id():
    r = MemoryOfferRepository()
    a = r.upsert_offer(make_offer())
    b = r.upsert_offer(make_offer(price=200))
    assert a.id == b.id and b.price == 200 and len(r.offers) == 1

def test_search_orders_by_similarity_and_filters():
    r = MemoryOfferRepository()
    o1 = r.upsert_offer(make_offer('1', 100, 'bed'))
    o2 = r.upsert_offer(make_offer('2', 100, 'sofa'))
    r.put_embedding(o1.id, 'm', 3, [1.0, 0.0, 0.0])
    r.put_embedding(o2.id, 'm', 3, [0.0, 1.0, 0.0])
    res = r.search([1.0, 0.0, 0.0], {'categories': ['bed']}, top_k=5, min_score=0.0)
    assert [x[0].external_id for x in res] == ['1']
```

- [ ] **Step 2: Write schema SQL** exactly per spec `sql/001_schema.sql`.

- [ ] **Step 3: Run tests, verify fail.**

- [ ] **Step 4: Implement** `models.Offer` dataclass + `MemoryOfferRepository` (dict by id, upsert key `(feed_id, external_id)`, in-memory embeddings dict, cosine filter/sort).

- [ ] **Step 5: Run tests, verify pass.**

- [ ] **Step 6: Commit.**

---

### Task 4: Import pipeline (fetch + parse + upsert + embed)

**Files:**
- Create: `catalog-service/app/httpguard.py`
- Create: `catalog-service/app/pipeline.py`
- Test: `catalog-service/tests/test_pipeline.py`

**Interfaces:**
- Produces:
  - `httpguard.is_public_http_url(url) -> bool`
  - `pipeline.build_offer(feed_id, parsed, content_hash) -> Offer`
  - `pipeline.content_hash(parsed) -> str`
  - `pipeline.import_offers(repo, feed, parsed_offers) -> ImportResult(created, updated, unchanged)`
  - `pipeline.embed_pending(repo, embedder, fetch_image, limit) -> EmbedResult(embedded, skipped, failed)`

- [ ] **Step 1: Write failing tests**

```python
from app import pipeline
from app.embedder import FakeEmbedder
from app.memory_repo import MemoryOfferRepository
from app.feed import ParsedOffer

def parsed(eid='1', picture='https://cdn.test/a.jpg', price=100):
    return ParsedOffer(external_id=eid, merchant='m', category='bed',
        category_raw='Кровати', name='k', vendor=None, model=None,
        description=None, price=price, old_price=None, currency='RUB',
        availability='in_stock', picture_url=picture, canonical_url='c',
        affiliate_url='a', erid='e', params={'Цвет': 'беж'}, raw={})

def test_import_creates_then_unchanged():
    r = MemoryOfferRepository()
    res1 = pipeline.import_offers(r, 1, [parsed()])
    assert (res1.created, res1.updated, res1.unchanged) == (1, 0, 0)
    res2 = pipeline.import_offers(r, 1, [parsed()])
    assert (res2.created, res2.updated, res2.unchanged) == (0, 0, 1)

def test_embed_pending_uses_fetcher_and_skips_private():
    r = MemoryOfferRepository()
    pipeline.import_offers(r, 1, [parsed()])
    seen = []
    def fetch(url):
        seen.append(url); return b'img'
    res = pipeline.embed_pending(r, FakeEmbedder(dim=8), fetch, limit=10)
    assert res.embedded == 1 and seen == ['https://cdn.test/a.jpg']
    # second run does nothing
    res2 = pipeline.embed_pending(r, FakeEmbedder(dim=8), fetch, limit=10)
    assert res2.embedded == 0
```

- [ ] **Step 2: Run tests, verify fail.**

- [ ] **Step 3: Implement** `httpguard.is_public_http_url` (parse URL, scheme http/https, hostname not localhost/private/link-local via `ipaddress`, reject raw IPs in private ranges). `content_hash` = sha256 of `external_id|picture_url|price|old_price|availability`. `import_offers` upserts and counts. `embed_pending` iterates `list_without_embedding`, skips non-public/None picture, calls `fetch_image`, embeds, stores.

- [ ] **Step 4: Run tests, verify pass.**

- [ ] **Step 5: Commit.**

---

### Task 5: Vector search service

**Files:**
- Create: `catalog-service/app/search.py`
- Test: `catalog-service/tests/test_search.py`

**Interfaces:**
- Produces:
  - `search.SearchFilters` dataclass: `categories: list[str] | None`, `price_min: float | None`, `price_max: float | None`, `merchant: str | None`
  - `search.search_offers(repo, embedder, *, image_bytes=None, text=None, filters, top_k, min_score) -> list[dict]` where each dict has `offer_id, name, price, old_price, currency, availability, picture_url, affiliate_url, erid, category, params, score`.
  - Raises `ValueError` if neither image nor text.

- [ ] **Step 1: Write failing tests** (uses MemoryOfferRepository + FakeEmbedder, seeded offers/embeddings).

- [ ] **Step 2: Run tests, verify fail.**

- [ ] **Step 3: Implement** image takes precedence; if only text, `embed_text`; call `repo.search`; map to dicts; clamp `top_k` (1..100), `min_score` (-1..1).

- [ ] **Step 4: Run tests, verify pass.**

- [ ] **Step 5: Commit.**

---

### Task 6: FastAPI app, endpoints, auth

**Files:**
- Create: `catalog-service/app/api.py`
- Create: `catalog-service/app/main.py`
- Test: `catalog-service/tests/test_api.py`

**Interfaces:**
- Produces: `main.create_app(settings=None, repo=None, embedder=None, fetcher=None) -> FastAPI`. Routes per spec. Auth dependency checks `X-Catalog-Token` for all but `/health`.

- [ ] **Step 1: Write failing tests** using `fastapi.testclient.TestClient` with injected `MemoryOfferRepository` + `FakeEmbedder` + fake fetcher; assert `/health` 200 without token, `/search` 401 without token and 200 with, `/feeds` create+list.

- [ ] **Step 2: Run tests, verify fail.**

- [ ] **Step 3: Implement** app factory + routes. `POST /feeds` stores feed; `POST /feeds/:id/sync` runs import in a thread (synchronous for tests) and returns job id. Keep sync endpoint simple: fetch feed URL via fetcher, parse, `import_offers`, `embed_pending`.

- [ ] **Step 4: Run tests, verify pass.**

- [ ] **Step 5: Commit.**

---

### Task 7: Remontvision migration, config, catalog client

**Files:**
- Create: `migrations/034_search_catalog.sql`
- Create: `src/catalogclient.js`
- Modify: `src/searchconfig.js`
- Test: `test/catalogclient.test.js`

**Interfaces:**
- Produces:
  - `catalogclient.searchCatalog({ image, imageMime, text, filters, topK, minScore }, deps={fetchImpl, baseUrl, token}) -> { results: [...] }`
  - config keys: `catalog_enabled`, `catalog_service_url`, `catalog_top_k`, `catalog_min_score`.

- [ ] **Step 1: Write failing test** (mock fetch) asserting request body/headers and URL from config.

- [ ] **Step 2: Run `node --test test/catalogclient.test.js`, verify fail.**

- [ ] **Step 3: Implement** migration, config keys with validation, and client with timeout + `{error}` on non-ok.

- [ ] **Step 4: Run test, verify pass.**

- [ ] **Step 5: Commit.**

---

### Task 8: Remontvision search integration

**Files:**
- Modify: `src/searchservice.js`
- Modify: `src/searchutil.js`
- Modify: `src/server.js` (`/buy/:id`)
- Test: `test/searchutil-catalog.test.js`

**Interfaces:**
- `mergeResults(textResults, visualResults, { limit, catalogResults })` — add catalog rows (source `catalog`) respecting limit and dedupe.
- `processObjectSearch` accepts `source='catalog'|'both'`, calls `searchCatalog` with object crop buffer (from `thumbnail_path`) and `object.search_query`, maps to rows with `affiliate_url`/`erid`.

- [ ] **Step 1: Write failing test** for `mergeResults` including catalog rows and dedupe.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** merge + search branch + `/buy` affiliate redirect. Persist `affiliate_url`/`erid` in `search_results` via `upsertSearchResult` (extend `db.js` mapping).

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit.**

---

### Task 9: Compose, Dockerfile, env, docs

**Files:**
- Create: `catalog-service/Dockerfile`
- Create: `catalog-service/.env.example`
- Modify: `docker-compose.yml`
- Modify: `docs/HISTORY.md`
- Modify: `llms.txt`

- [ ] **Step 1: Add `catalog` + `catalog-db` services** (pgvector image, internal network, token env).
- [ ] **Step 2: Dockerfile** (python:3.12-slim, install requirements, uvicorn).
- [ ] **Step 3: Document** service, env vars, and verification.
- [ ] **Step 4: Run** `node --check` on changed JS, `npm test`, `python3 -m pytest catalog-service -q`.
- [ ] **Step 5: Commit.**

---

### Task 10: Spike (throwaway, not committed to prod path)

**Files:**
- Create: `catalog-service/scripts/spike_dino.py` (documented, throwaway)

- [ ] **Step 1:** Script loads DINOv2 + dino.txt, embeds a directory of catalog images and query crops, prints Top-1/Top-3 and cosine scores for manual labeling.
- [ ] **Step 2:** Run on 20–30 offers from feed 789 vs render crops; record `min_score` and dim in the spec's open questions.
- [ ] **Step 3:** Do not block the service on the spike; thresholds are config.
