"""Цветовой дескриптор товара: гистограмма цвета обивочной зоны.

Нужен как второй сигнал к DINOv2: семантика отвечает «что это», цвет —
«какого это оттенка». Гистограмма считается не по всему кадру (иначе бельё,
плед и фон разбавляют цвет обивки), а по цветным пикселям средней яркости.
Устойчива к разному кадру: не зависит от положения предмета.
"""

from __future__ import annotations

import io

import numpy as np
from PIL import Image

BINS = 8
SIZE = 128


def _array(image_bytes: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image = image.resize((SIZE, SIZE))
    return np.asarray(image, dtype=np.float32).reshape(-1, 3) / 255.0


def _surface_pixels(px: np.ndarray) -> np.ndarray:
    """Пиксели-кандидаты обивки: цветные, средней яркости, не белый фон."""
    maxc = px.max(axis=1)
    minc = px.min(axis=1)
    sat = maxc - minc
    val = maxc
    keep = (val > 0.10) & (val < 0.85) & (sat > 0.15)
    if int(keep.sum()) < 80:
        # Нейтральный товар (серый/белый): берём всё, кроме белого фона.
        keep = val < 0.90
    selected = px[keep]
    if selected.shape[0] < 50:
        selected = px
    return selected


def descriptor(image_bytes: bytes) -> list[float]:
    """512-бинная RGB-гистограмма (8×8×8) по пикселям обивки."""
    selected = _surface_pixels(_array(image_bytes))
    idx = np.clip((selected * BINS).astype(np.int32), 0, BINS - 1)
    hist = np.zeros((BINS, BINS, BINS), dtype=np.float32)
    np.add.at(hist, (idx[:, 0], idx[:, 1], idx[:, 2]), 1.0)
    hist = hist.reshape(-1)
    total = float(hist.sum())
    if total > 0:
        hist /= total
    return hist.tolist()


def similarity(a: list[float] | None, b: list[float] | None) -> float:
    """Пересечение гистограмм: 1.0 — цвета совпадают, 0.0 — нет."""
    if not a or not b or len(a) != len(b):
        return 0.0
    return float(sum(min(x, y) for x, y in zip(a, b)))
