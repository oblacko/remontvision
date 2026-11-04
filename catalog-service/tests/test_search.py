import pytest

from app import pipeline, search
from app.embedder import FakeEmbedder
from app.feed import ParsedOffer
from app.memory_repo import MemoryOfferRepository


def parsed(eid, category, price, picture):
    return ParsedOffer(
        external_id=eid,
        merchant="shop",
        category=category,
        category_raw=category,
        name=f"item {eid}",
        vendor=None,
        model=None,
        description=None,
        price=price,
        old_price=None,
        currency="RUB",
        availability="in_stock",
        picture_url=picture,
        canonical_url="c",
        affiliate_url="https://trk.ppdu.ru/x",
        erid="erid",
        params={},
        raw={},
    )


def seeded():
    repo = MemoryOfferRepository()
    pipeline.import_offers(
        repo,
        1,
        [
            parsed("1", "bed", 100, "https://cdn.test/1.jpg"),
            parsed("2", "sofa", 500, "https://cdn.test/2.jpg"),
        ],
    )
    pipeline.embed_pending(
        repo, FakeEmbedder(dim=8), lambda url: url.encode(), limit=10
    )
    return repo


def test_search_requires_image_or_text():
    with pytest.raises(ValueError):
        search.search_offers(MemoryOfferRepository(), FakeEmbedder(dim=8))


def test_search_by_image_returns_mapped_results():
    repo = seeded()
    res = search.search_offers(
        repo, FakeEmbedder(dim=8), image_bytes=b"https://cdn.test/1.jpg"
    )
    assert res
    first = res[0]
    assert first["offer_id"] and first["affiliate_url"] == "https://trk.ppdu.ru/x"
    assert first["erid"] == "erid"
    assert isinstance(first["score"], float)


def test_search_text_and_category_filter():
    repo = seeded()
    res = search.search_offers(
        repo,
        FakeEmbedder(dim=8),
        text="sofa",
        filters=search.SearchFilters(categories=["sofa"]),
        top_k=5,
    )
    assert [r["category"] for r in res] == ["sofa"]


def test_search_price_filter_excludes_out_of_range():
    repo = seeded()
    res = search.search_offers(
        repo,
        FakeEmbedder(dim=8),
        text="x",
        filters=search.SearchFilters(price_min=200),
        top_k=5,
    )
    assert all(r["price"] >= 200 for r in res)


def test_search_top_k_clamped():
    repo = seeded()
    res = search.search_offers(repo, FakeEmbedder(dim=8), text="x", top_k=1)
    assert len(res) <= 1


def _solid(rgb, size=(64, 64)):
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new('RGB', size, rgb).save(buf, format='PNG')
    return buf.getvalue()


def test_color_rerank_puts_matching_color_first():
    from app import color
    from app.models import Offer

    repo = MemoryOfferRepository()

    def make(eid):
        return Offer(feed_id=1, external_id=eid, name=eid, category='bed',
                     price=100, currency='RUB', availability='in_stock',
                     picture_url='https://cdn.test/x.jpg')

    brown = repo.upsert_offer(make('brown'))
    gray = repo.upsert_offer(make('gray'))
    repo.put_embedding(brown.id, 'fake', 8, [1.0] * 8)
    repo.put_embedding(gray.id, 'fake', 8, [1.0] * 8)
    repo.set_color(brown.id, color.descriptor(_solid((120, 80, 40))))
    repo.set_color(gray.id, color.descriptor(_solid((128, 128, 130))))

    res = search.search_offers(
        repo, FakeEmbedder(dim=8), image_bytes=_solid((122, 82, 42)),
        top_k=2, min_score=-1.0, color_weight=0.6, rerank_pool=10,
    )
    assert res[0]['offer_id'] == brown.id
    assert 'dino_score' in res[0] and 'color_score' in res[0]


def test_attribute_rerank_prefers_matching_offer():
    from app.models import Offer

    repo = MemoryOfferRepository()

    def make(eid, name, params):
        return Offer(feed_id=1, external_id=eid, name=name, params=params,
                     category='bed', price=100, currency='RUB',
                     availability='in_stock', picture_url='https://cdn.test/x.jpg')

    brown = repo.upsert_offer(make('brown', 'Кровать мокко', {'Цвет': 'Мокко'}))
    gray = repo.upsert_offer(make('gray', 'Кровать серый', {'Цвет': 'Серый'}))
    repo.put_embedding(brown.id, 'fake', 8, [1.0] * 8)
    repo.put_embedding(gray.id, 'fake', 8, [1.0] * 8)

    res = search.search_offers(
        repo, FakeEmbedder(dim=8), image_bytes=_solid((120, 80, 40)),
        top_k=2, min_score=-1.0,
        product={'color': 'коричневый', 'label': 'Кровать'},
        attr_weight=0.6, color_weight=0.0, rerank_pool=10,
    )
    assert res[0]['offer_id'] == brown.id
    assert 'attr_score' in res[0]


def test_search_filters_by_product_type():
    from app.models import Offer

    repo = MemoryOfferRepository()

    def make(eid, name, params):
        return Offer(feed_id=1, external_id=eid, name=name, params=params,
                     category='bed', price=100, currency='RUB',
                     availability='in_stock', picture_url='https://cdn.test/x.jpg')

    soft = repo.upsert_offer(make('soft', 'Кровать мягкая', {'Цвет': 'капучино', 'Тип обивки': 'велюр'}))
    wood = repo.upsert_offer(make('wood', 'Кровать деревянная', {'Цвет': 'капучино', 'Материал каркаса': 'ЛДСП'}))
    repo.put_embedding(soft.id, 'fake', 8, [1.0] * 8)
    repo.put_embedding(wood.id, 'fake', 8, [1.0] * 8)

    res = search.search_offers(
        repo, FakeEmbedder(dim=8), image_bytes=_solid((120, 80, 40)),
        top_k=2, min_score=-1.0,
        product={'color': 'коричневый', 'product_type': 'мягкая', 'label': 'Кровать'},
        attr_weight=0.5, color_weight=0.0, rerank_pool=10,
    )
    ids = [r['offer_id'] for r in res]
    assert soft.id in ids
    assert wood.id not in ids


def test_category_fallback_when_filter_has_no_results():
    from app.models import Offer

    repo = MemoryOfferRepository()

    def make(eid, category):
        return Offer(feed_id=1, external_id=eid, name=eid, category=category,
                     price=100, currency='RUB', availability='in_stock',
                     picture_url='https://cdn.test/x.jpg')

    a = repo.upsert_offer(make('a', 'bed'))
    b = repo.upsert_offer(make('b', 'sofa'))
    repo.put_embedding(a.id, 'fake', 8, [1.0] * 8)
    repo.put_embedding(b.id, 'fake', 8, [1.0] * 8)

    res = search.search_offers(
        repo, FakeEmbedder(dim=8), image_bytes=_solid((120, 80, 40)),
        top_k=2, min_score=-1.0,
        filters=search.SearchFilters(categories=['curtain']),
    )
    assert res
    assert all(r.get('category_fallback') for r in res)


def test_text_search_by_keywords_and_category():
    from app.models import Offer

    repo = MemoryOfferRepository()

    def make(eid, name, category, params):
        return Offer(feed_id=1, external_id=eid, name=name, category=category,
                     params=params, price=100, currency='RUB',
                     availability='in_stock', picture_url='https://cdn.test/x.jpg')

    mokko = repo.upsert_offer(make('m', 'Кровать мокко велюр', 'bed', {'Цвет': 'Мокко'}))
    gray = repo.upsert_offer(make('g', 'Кровать серый велюр', 'bed', {'Цвет': 'Серый'}))
    res = search.search_by_keywords(repo, query='мокко', top_k=5)
    assert res and res[0]['offer_id'] == mokko.id
    res2 = search.search_by_keywords(repo, query='', filters=search.SearchFilters(categories=['bed']), product={'color': 'серый'}, top_k=5)
    assert res2 and res2[0]['offer_id'] == gray.id
