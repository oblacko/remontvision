import base64
from pathlib import Path

from fastapi.testclient import TestClient

from app import pipeline
from app.api import create_app
from app.config import Settings
from app.embedder import FakeEmbedder
from app.feed import ParsedOffer
from app.memory_repo import MemoryOfferRepository

TOKEN = "test-token"
HEADERS = {"X-Catalog-Token": TOKEN}
FIXTURE = (Path(__file__).parent / "fixtures" / "feed_min.xml").read_bytes()


def settings():
    return Settings(
        database_url="",
        catalog_token=TOKEN,
        embedder="fake",
        embed_model="fake",
        embed_dim=8,
        embed_concurrency=4,
        color_rerank_weight=0.0,
        color_rerank_pool=10,
        max_feed_bytes=10_000_000,
        http_timeout_s=5.0,
    )


def parsed(eid="1", picture="https://cdn.test/1.jpg"):
    return ParsedOffer(
        external_id=eid,
        merchant="m",
        category="bed",
        category_raw="Кровати",
        name="k",
        vendor=None,
        model=None,
        description=None,
        price=100,
        old_price=None,
        currency="RUB",
        availability="in_stock",
        picture_url=picture,
        canonical_url="c",
        affiliate_url="a",
        erid="e",
        params={},
        raw={},
    )


def make_client(repo=None, fetcher=None):
    repo = repo or MemoryOfferRepository()
    return TestClient(
        create_app(settings(), repo=repo, embedder=FakeEmbedder(dim=8), fetcher=fetcher)
    ), repo


def test_health_is_public():
    client, _ = make_client()
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_protected_endpoint_requires_token():
    client, _ = make_client()
    assert client.get("/models").status_code == 401
    assert client.get("/models", headers=HEADERS).status_code == 200


def test_create_and_list_feed():
    client, _ = make_client()
    r = client.post(
        "/feeds", json={"name": "feed789", "url": "https://f.test/789"}, headers=HEADERS
    )
    assert r.status_code == 200 and r.json()["id"] == 1
    rows = client.get("/feeds", headers=HEADERS).json()
    assert len(rows) == 1 and rows[0]["name"] == "feed789"


def test_sync_imports_and_embeds():
    def fetcher(url):
        if url == "https://f.test/789":
            return FIXTURE
        return b"img"

    client, repo = make_client(fetcher=fetcher)
    feed = client.post(
        "/feeds", json={"name": "f", "url": "https://f.test/789"}, headers=HEADERS
    ).json()
    r = client.post(f"/feeds/{feed['id']}/sync", headers=HEADERS)
    assert r.status_code == 200
    assert len(repo.offers) == 2
    assert repo.list_without_embedding() == []


def test_search_endpoint_returns_results():
    repo = MemoryOfferRepository()
    pipeline.import_offers(repo, 1, [parsed()])
    pipeline.embed_pending(repo, FakeEmbedder(dim=8), lambda u: u.encode())
    client, _ = make_client(repo=repo)
    body = {
        "image_b64": base64.b64encode(b"https://cdn.test/1.jpg").decode(),
        "top_k": 5,
        "min_score": 0.0,
    }
    r = client.post("/search", json=body, headers=HEADERS)
    assert r.status_code == 200
    data = r.json()["results"]
    assert len(data) == 1 and data[0]["affiliate_url"] == "a"


def test_search_without_input_is_400():
    client, _ = make_client()
    r = client.post("/search", json={}, headers=HEADERS)
    assert r.status_code == 400
