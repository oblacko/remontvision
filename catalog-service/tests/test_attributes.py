from app import attributes
from app.models import Offer


def make_offer(name, params=None):
    return Offer(feed_id=1, external_id=name, name=name, params=params or {})


def test_color_synonym_prefers_matching_offer():
    product = {"color": "коричневый", "label": "Кровать", "description": "велюр"}
    brown = attributes.attribute_score(product, make_offer("Кровать велюр мокко"))
    gray = attributes.attribute_score(product, make_offer("Кровать велюр серый"))
    assert brown > gray


def test_material_and_size_match():
    product = {"material": "дуб", "size": "160x200"}
    good = attributes.attribute_score(product, make_offer("Кровать дуб 160 200"))
    bad = attributes.attribute_score(product, make_offer("Кровать 180 220"))
    assert good > bad


def test_empty_product_scores_zero():
    assert attributes.attribute_score(None, make_offer("Кровать")) == 0.0


def test_description_keywords_used():
    product = {"label": "Кровать", "description": "подъемный механизм велюр"}
    hit = attributes.attribute_score(
        product, make_offer("Кровать с подъемным механизмом велюр")
    )
    miss = attributes.attribute_score(product, make_offer("Шкаф дубовый"))
    assert hit > miss


def test_product_type_soft_vs_wood():
    soft = make_offer('Кровать', {'Цвет': 'капучино', 'Тип обивки': 'велюр'})
    wood = make_offer('Кровать', {'Цвет': 'белый шагрень', 'Материал каркаса': 'ЛДСП'})
    assert attributes.offer_product_type(soft) == 'soft'
    assert attributes.offer_product_type(wood) == 'wood'


def test_color_family_from_params():
    offer = make_offer('Кровать', {'Цвет': 'какао'})
    assert attributes.offer_color_family(offer) == 'brown'
    gray = make_offer('Кровать', {'Цвет': 'тёмно-серый'})
    assert attributes.offer_color_family(gray) == 'gray'


def test_type_mismatch_penalized():
    soft = make_offer('Кровать', {'Цвет': 'капучино', 'Тип обивки': 'велюр'})
    wood = make_offer('Кровать', {'Цвет': 'капучино', 'Материал каркаса': 'ЛДСП'})
    product = {'color': 'коричневый', 'product_type': 'мягкая', 'label': 'Кровать'}
    assert attributes.attribute_score(product, soft) > attributes.attribute_score(product, wood)


def test_stem_russian_endings():
    assert attributes.stem('кухонные') == 'кухонн'
    assert attributes.stem('шкафы') == 'шкаф'
    assert attributes.stem('кровати') == 'кроват'
