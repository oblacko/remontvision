from app import vectors


def test_normalize_makes_unit_length():
    out = vectors.normalize([3.0, 4.0])
    assert abs((out[0] ** 2 + out[1] ** 2) - 1.0) < 1e-9


def test_normalize_zero_vector_is_safe():
    assert vectors.normalize([0.0, 0.0]) == [0.0, 0.0]


def test_cosine_identical_is_one():
    a = vectors.normalize([1.0, 2.0, 3.0])
    assert abs(vectors.cosine(a, a) - 1.0) < 1e-9


def test_cosine_orthogonal_is_zero():
    assert abs(vectors.cosine([1.0, 0.0], [0.0, 1.0])) < 1e-9
