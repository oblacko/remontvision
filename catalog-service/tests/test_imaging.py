import io

import numpy as np
from PIL import Image

from app import imaging


def solid(rgb, size=(120, 80)):
    buf = io.BytesIO()
    Image.new("RGB", size, rgb).save(buf, format="PNG")
    return buf.getvalue()


def test_kmeans_separates_two_clusters():
    a = np.array([[1, 0, 0]] * 10 + [[0, 1, 0]] * 10, dtype=np.float32)
    labels, _ = imaging.kmeans(a, 2)
    assert labels[:10].min() == labels[:10].max()
    assert labels[10:].min() == labels[10:].max()
    assert labels[0] != labels[10]


def test_segments_with_fake_patch_features():
    def patch_features(_image_bytes):
        feat = np.zeros((4, 4, 3), dtype=np.float32)
        feat[:, :2, :] = [1, 0, 0]
        feat[:, 2:, :] = [0, 1, 0]
        return feat

    items = imaging.segments(
        solid((120, 80, 40), (64, 64)), patch_features, k=2, min_area=0.01, max_area=0.6
    )
    assert len(items) >= 1
    assert all("thumb_b64" in item for item in items)
    assert all(item["label"].startswith("сегмент") for item in items)


def test_masked_card_composites_object_on_white():
    arr = np.zeros((10, 10, 3), dtype=np.uint8)
    arr[:] = [10, 20, 30]
    mask = np.zeros((10, 10), dtype=bool)
    mask[2:8, 3:9] = True
    thumb = imaging.masked_card(arr, mask)
    assert isinstance(thumb, str) and len(thumb) > 50
