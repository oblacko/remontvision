from app.embedder import FakeEmbedder, HistogramEmbedder


def test_fake_embedder_is_deterministic_and_sized():
    e = FakeEmbedder(dim=16)
    a = e.embed_text("кровать беж")
    b = e.embed_text("кровать беж")
    assert len(a) == 16 and a == b


def test_fake_embedder_image_differs_by_bytes():
    e = FakeEmbedder(dim=16)
    assert e.embed_image(b"one") != e.embed_image(b"two")


def test_fake_embedder_returns_unit_vectors():
    e = FakeEmbedder(dim=8)
    v = e.embed_text("sofa")
    assert abs(sum(x * x for x in v) - 1.0) < 1e-9


def _solid_png(rgb, size=(32, 32)):
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, rgb).save(buf, format="PNG")
    return buf.getvalue()


def test_histogram_embedder_is_deterministic_and_sized():
    e = HistogramEmbedder(dim=1280)
    a = e.embed_image(_solid_png((200, 30, 30)))
    b = e.embed_image(_solid_png((200, 30, 30)))
    assert len(a) == 1280
    assert a == b


def test_histogram_embedder_separates_colors():
    e = HistogramEmbedder(dim=1280)
    red = e.embed_image(_solid_png((220, 20, 20)))
    blue = e.embed_image(_solid_png((20, 20, 220)))
    same = e.embed_image(_solid_png((210, 25, 25)))
    from app import vectors

    assert vectors.cosine(red, same) > vectors.cosine(red, blue)
