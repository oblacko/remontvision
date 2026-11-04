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
    assert categories.map_category("Книги", "Роман") == "other"


def test_parse_yml_filters_by_root_category_subtree():
    xml = b"""<?xml version="1.0"?><yml_catalog><shop>
    <categories>
      <category id="625">\xd0\xa1\xd0\xbf\xd0\xb0\xd0\xbb\xd1\x8c\xd0\xbd\xd1\x8f</category>
      <category id="687" parentId="625">\xd0\x9a\xd1\x80\xd0\xbe\xd0\xb2\xd0\xb0\xd1\x82\xd0\xb8</category>
      <category id="624">\xd0\x93\xd0\xbe\xd1\x81\xd1\x82\xd0\xb8\xd0\xbd\xd0\xb0\xd1\x8f</category>
      <category id="633" parentId="624">\xd0\x94\xd0\xb8\xd0\xb2\xd0\xb0\xd0\xbd\xd1\x8b</category>
    </categories>
    <offers>
      <offer id="1" available="true"><price>100</price><categoryId>687</categoryId><name>\xd0\x9a\xd1\x80\xd0\xbe\xd0\xb2\xd0\xb0\xd1\x82\xd1\x8c</name><picture>https://cdn.test/1.jpg</picture></offer>
      <offer id="2" available="true"><price>200</price><categoryId>633</categoryId><name>\xd0\x94\xd0\xb8\xd0\xb2\xd0\xb0\xd0\xbd</name><picture>https://cdn.test/2.jpg</picture></offer>
    </offers></shop></yml_catalog>"""
    offers = feed.parse_yml(xml, source_url="x", root_category_id="625")
    assert [o.external_id for o in offers] == ["1"]
    assert len(feed.parse_yml(xml, source_url="x")) == 2


def test_path_mapping_specific_cases():
    m = categories.map_category_path
    assert m('Кухня > Обеденные группы > Кухонные столы') == 'dining_table'
    assert m('Товары для дома > Посуда > Столовая посуда > Тарелки > Обеденные тарелки') == 'tableware'
    assert m('Спальня > Туалетные столики и банкетки > Туалетные столики в спальню') == 'dressing_table'
    assert m('Товары для дома > Декор > Декор для стен > Картины и репродукции') == 'decor_art'
    assert m('Товары для дома > Текстиль > Текстиль для ванной > Полотенца для ванной') == 'bath_textile'
    assert m('Спальня > Спальные гарнитуры') == 'furniture_set'


def test_tumba_maps_to_sideboard():
    assert categories.map_category_path('Спальня > Тумбы и комоды > Тумбы для спальни') == 'sideboard'
    assert categories.map_category_path('Гостиная > Мебель для гостиных > Тумбы под ТВ') == 'sideboard'


def test_kitchen_wall_cabinets_map_to_cabinet():
    assert categories.map_category_path('Кухня > Кухонные шкафы > Шкафы навесные') == 'cabinet'
    assert categories.map_category_path('Спальня > Шкафы > Шкафы для одежды') == 'wardrobe'
