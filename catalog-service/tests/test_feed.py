from pathlib import Path

from app import categories, feed

FIXTURE = Path(__file__).parent / "fixtures" / "feed_min.xml"


def test_parse_yml_reads_offer_and_params():
    xml = FIXTURE.read_bytes()
    offers = feed.parse_yml(xml, source_url="https://example.test/feed")
    assert len(offers) == 2
    o = offers[0]
    assert o.external_id == "534277"
    assert o.price == 39700
    assert o.old_price == 70999
    assert o.availability == "in_stock"
    assert o.category == "bed"
    assert o.params.get("Цвет") == "Латте"
    assert o.erid == "2SDnjbstwzi"
    assert o.canonical_url == "https://DIVANBOSS.RU/krovati/boss-layn/"
    assert o.affiliate_url.startswith("https://trk.ppdu.ru/click/")


def test_second_offer_out_of_stock_and_relative_picture():
    offers = feed.parse_yml(FIXTURE.read_bytes(), source_url="https://trk.ppdu.ru/feed")
    sofa = offers[1]
    assert sofa.availability == "out_of_stock"
    assert sofa.category == "sofa"
    assert sofa.merchant == "divanboss.ru"
    assert sofa.picture_url == "https://trk.ppdu.ru/upload/iblock/rel/sofa.jpg"


def test_decode_target_url_extracts_canonical_and_erid():
    url = (
        "https://trk.ppdu.ru/click/X?erid=2SDabc&dl=https%3A%2F%2FDIVANBOSS.RU%2Fp%2F1"
    )
    canonical, erid = feed.decode_target_url(url)
    assert erid == "2SDabc"
    assert canonical == "https://DIVANBOSS.RU/p/1"


def test_plain_url_has_no_erid():
    canonical, erid = feed.decode_target_url("https://shop.test/item/1")
    assert canonical == "https://shop.test/item/1"
    assert erid is None


def test_parse_empty_feed_returns_empty():
    assert (
        feed.parse_yml(b"<yml_catalog><shop></shop></yml_catalog>", source_url="x")
        == []
    )


def test_parse_malformed_feed_returns_empty():
    assert feed.parse_yml(b"not xml", source_url="x") == []


def test_category_mapping():
    assert categories.map_category("Кровати", "") == "bed"
    assert categories.map_category("", "Диван прямой") == "sofa"
    assert categories.map_category("Книги", "Роман") is None
