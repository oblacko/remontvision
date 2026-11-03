from app import pipeline
from app.embedder import FakeEmbedder
from app.feed import ParsedOffer
from app.memory_repo import MemoryOfferRepository


def parsed(eid="1", picture="https://cdn.test/a.jpg", price=100):
    return ParsedOffer(
        external_id=eid,
        merchant="m",
        category="bed",
        category_raw="Кровати",
        name="k",
        vendor=None,
        model=None,
        description=None,
        price=price,
        old_price=None,
        currency="RUB",
        availability="in_stock",
        picture_url=picture,
        canonical_url="c",
        affiliate_url="a",
        erid="e",
        params={"Цвет": "беж"},
        raw={},
    )


def test_import_creates_then_unchanged():
    r = MemoryOfferRepository()
    res1 = pipeline.import_offers(r, 1, [parsed()])
    assert (res1.created, res1.updated, res1.unchanged) == (1, 0, 0)
    res2 = pipeline.import_offers(r, 1, [parsed()])
    assert (res2.created, res2.updated, res2.unchanged) == (0, 0, 1)


def test_import_price_change_is_update_and_reembeds_on_picture_change():
    r = MemoryOfferRepository()
    pipeline.import_offers(r, 1, [parsed()])
    o = r.find_offer(1, "1")
    r.put_embedding(o.id, "fake", 8, [1.0] * 8)
    res = pipeline.import_offers(r, 1, [parsed(price=200)])
    assert res.updated == 1
    # цена изменилась, но картинка та же — эмбеддинг сохраняется
    assert r.list_without_embedding() == []
    res2 = pipeline.import_offers(
        r, 1, [parsed(price=200, picture="https://cdn.test/b.jpg")]
    )
    assert res2.updated == 1
    assert [x.external_id for x in r.list_without_embedding()] == ["1"]


def test_embed_pending_uses_fetcher_and_skips_private():
    r = MemoryOfferRepository()
    pipeline.import_offers(r, 1, [parsed()])
    seen = []

    def fetch(url):
        seen.append(url)
        return b"img"

    res = pipeline.embed_pending(r, FakeEmbedder(dim=8), fetch, limit=10)
    assert res.embedded == 1 and seen == ["https://cdn.test/a.jpg"]
    res2 = pipeline.embed_pending(r, FakeEmbedder(dim=8), fetch, limit=10)
    assert res2.embedded == 0


def test_embed_pending_skips_private_url_without_fetching():
    r = MemoryOfferRepository()
    pipeline.import_offers(r, 1, [parsed(picture="http://127.0.0.1/x.jpg")])
    called = []
    res = pipeline.embed_pending(
        r, FakeEmbedder(dim=8), lambda u: called.append(u), limit=10
    )
    assert res.skipped == 1 and called == []


def test_embed_failure_counts_and_continues():
    r = MemoryOfferRepository()
    pipeline.import_offers(r, 1, [parsed("1"), parsed("2", "https://cdn.test/b.jpg")])
    calls = {"n": 0}

    def fetch(url):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")
        return b"ok"

    res = pipeline.embed_pending(r, FakeEmbedder(dim=8), fetch, limit=10, concurrency=1)
    assert res.failed == 1 and res.embedded == 1


def test_embed_all_processes_batches_until_done():
    r = MemoryOfferRepository()
    offers = [parsed(str(i), f"https://cdn.test/{i}.jpg") for i in range(5)]
    pipeline.import_offers(r, 1, offers)
    res = pipeline.embed_all(r, FakeEmbedder(dim=8), lambda u: b"img", batch=2)
    assert res.embedded == 5
    assert r.list_without_embedding() == []


def test_backfill_colors_sets_descriptors():
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (120, 80, 40)).save(buf, format="PNG")
    png = buf.getvalue()

    r = MemoryOfferRepository()
    pipeline.import_offers(r, 1, [parsed("1"), parsed("2", "https://cdn.test/b.jpg")])
    assert len(r.list_without_color()) == 2
    res = pipeline.backfill_all_colors(r, lambda u: png, batch=1)
    assert res.colored == 2
    assert r.list_without_color() == []


def test_caching_fetcher_caches_by_url(tmp_path):
    calls = []

    def base(url):
        calls.append(url)
        return b'payload-' + url.encode()

    fetch = pipeline.caching_fetcher(base, str(tmp_path))
    a = fetch('https://cdn.test/a.jpg')
    b = fetch('https://cdn.test/a.jpg')
    assert a == b == b'payload-https://cdn.test/a.jpg'
    assert calls == ['https://cdn.test/a.jpg']
    assert fetch('https://cdn.test/b.jpg') == b'payload-https://cdn.test/b.jpg'
    assert len(calls) == 2
