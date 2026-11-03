from app.memory_repo import MemoryOfferRepository
from app.models import Offer


def make_offer(eid="1", price=100, category="bed"):
    return Offer(
        id=None,
        feed_id=1,
        external_id=eid,
        merchant="m",
        category=category,
        category_raw="Кровати",
        name="k",
        vendor=None,
        model=None,
        description=None,
        price=price,
        old_price=None,
        currency="RUB",
        availability="in_stock",
        picture_url="p",
        picture_path=None,
        canonical_url="c",
        affiliate_url="a",
        erid="e",
        params={},
        raw={},
        status="active",
        content_hash="h",
    )


def test_upsert_by_feed_and_external_id():
    r = MemoryOfferRepository()
    a = r.upsert_offer(make_offer())
    b = r.upsert_offer(make_offer(price=200))
    assert a.id == b.id and b.price == 200 and len(r.offers) == 1


def test_get_offer_roundtrip():
    r = MemoryOfferRepository()
    saved = r.upsert_offer(make_offer())
    assert r.get_offer(saved.id).external_id == "1"


def test_put_embedding_and_list_without_embedding():
    r = MemoryOfferRepository()
    o = r.upsert_offer(make_offer())
    assert [x.id for x in r.list_without_embedding()] == [o.id]
    r.put_embedding(o.id, "m", 3, [1.0, 0.0, 0.0])
    assert r.list_without_embedding() == []


def test_search_orders_by_similarity_and_filters():
    r = MemoryOfferRepository()
    o1 = r.upsert_offer(make_offer("1", 100, "bed"))
    o2 = r.upsert_offer(make_offer("2", 100, "sofa"))
    r.put_embedding(o1.id, "m", 3, [1.0, 0.0, 0.0])
    r.put_embedding(o2.id, "m", 3, [0.0, 1.0, 0.0])
    res = r.search([1.0, 0.0, 0.0], {"categories": ["bed"]}, top_k=5, min_score=0.0)
    assert [x[0].external_id for x in res] == ["1"]


def test_search_respects_price_filter_and_top_k():
    r = MemoryOfferRepository()
    a = r.upsert_offer(make_offer("1", 100))
    b = r.upsert_offer(make_offer("2", 500))
    r.put_embedding(a.id, "m", 2, [1.0, 0.0])
    r.put_embedding(b.id, "m", 2, [1.0, 0.0])
    res = r.search([1.0, 0.0], {"price_min": 200}, top_k=5, min_score=-1.0)
    assert [x[0].external_id for x in res] == ["2"]
    res2 = r.search([1.0, 0.0], {}, top_k=1, min_score=-1.0)
    assert len(res2) == 1
