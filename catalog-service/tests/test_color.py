import io

from PIL import Image

from app import color


def solid(rgb, size=(64, 64)):
    buf = io.BytesIO()
    Image.new("RGB", size, rgb).save(buf, format="PNG")
    return buf.getvalue()


def test_descriptor_is_normalized_512():
    hist = color.descriptor(solid((120, 80, 40)))
    assert len(hist) == 512
    assert abs(sum(hist) - 1.0) < 1e-6


def test_similarity_prefers_same_color():
    brown = color.descriptor(solid((120, 80, 40)))
    brown2 = color.descriptor(solid((125, 85, 45)))
    gray = color.descriptor(solid((128, 128, 130)))
    assert color.similarity(brown, brown2) > color.similarity(brown, gray)


def test_similarity_handles_missing():
    assert color.similarity(None, [1.0]) == 0.0
    assert color.similarity([1.0], [1.0, 2.0]) == 0.0
