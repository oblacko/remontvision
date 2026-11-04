import numpy as np
from PIL import Image

from app import ade20k
from app import segmentation_head as sh


def fixture_labels():
    labels = np.zeros((30, 30), dtype=np.uint8)
    labels[2:10, 2:12] = ade20k.ADE20K_CLASSES.index("bed")
    labels[15:25, 15:28] = ade20k.ADE20K_CLASSES.index("sofa")
    return labels


def test_ade_mapping():
    assert ade20k.ADE_TO_INTERNAL["bed"] == "bed"
    assert ade20k.ADE_TO_INTERNAL["coffee table"] == "coffee_table"
    assert ade20k.ADE_TO_INTERNAL["wardrobe"] == "wardrobe"
    assert ade20k.ADE_TO_INTERNAL.get("wall") is None


def test_components_finds_objects():
    items = sh._components(fixture_labels(), 10)
    cats = {item["category"] for item in items}
    assert "bed" in cats and "sofa" in cats
    assert all("bbox" in item and "area" in item for item in items)


def test_component_at_click():
    labels = fixture_labels()
    bed = ade20k.ADE20K_CLASSES.index("bed")
    mask = sh._component_at(labels, bed, 5, 5)
    assert mask is not None and int(mask.sum()) == 8 * 10


def test_overlay_returns_png_b64():
    image = Image.new("RGB", (30, 30), (128, 128, 128))
    b64 = sh._overlay(image, fixture_labels())
    assert isinstance(b64, str) and len(b64) > 100
