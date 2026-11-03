"""Сегментация (DINOv2 patch-фичи + k-means) и нарезка сеткой для демо-страницы."""

from __future__ import annotations

import base64
import io
import math

import numpy as np
from PIL import Image

THUMB = 256
SEG_SIZE = 224


def _encode(image: Image.Image, quality: int = 80) -> str:
    buf = io.BytesIO()
    image.convert("RGB").save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode()


def _card(crop: Image.Image, size: int = THUMB) -> Image.Image:
    """Кладёт вырезку на белый квадрат, сохраняя пропорции."""
    w, h = crop.size
    if w <= 0 or h <= 0:
        return Image.new("RGB", (size, size), (255, 255, 255))
    scale = min(size / w, size / h)
    crop = crop.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    card = Image.new("RGB", (size, size), (255, 255, 255))
    card.paste(crop, ((size - crop.width) // 2, (size - crop.height) // 2))
    return card


def masked_card(image_array: np.ndarray, mask: np.ndarray, size: int = THUMB) -> str:
    """Вырезает объект по маске, кладёт на белый фон и отдаёт base64 JPEG."""
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return _encode(_card(Image.new("RGB", (8, 8), (255, 255, 255)), size))
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    crop = image_array[y0:y1, x0:x1]
    region = mask[y0:y1, x0:x1]
    out = np.full_like(crop, 255)
    out[region] = crop[region]
    return _encode(_card(Image.fromarray(out), size))


def kmeans(features: np.ndarray, k: int, iters: int = 20, seed: int = 0):
    x = np.asarray(features, dtype=np.float32)
    x = x / (np.linalg.norm(x, axis=-1, keepdims=True) + 1e-8)
    n = x.shape[0]
    k = max(1, min(int(k), n))
    rng = np.random.default_rng(seed)
    centers = x[rng.choice(n, k, replace=False)].copy()
    labels = np.zeros(n, dtype=np.int32)
    for _ in range(iters):
        dist = ((x[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        labels = dist.argmin(1)
        for j in range(k):
            member = labels == j
            if member.any():
                centers[j] = x[member].mean(0)
    return labels, centers


def _component_boxes(mask: np.ndarray, min_pixels: int) -> list[tuple]:
    """Связные компоненты маски (4-соседство) → bbox + площадь."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    boxes: list[tuple] = []
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0, x0] or seen[y0, x0]:
                continue
            stack = [(y0, x0)]
            seen[y0, x0] = True
            xs: list[int] = []
            ys: list[int] = []
            while stack:
                y, x = stack.pop()
                xs.append(x)
                ys.append(y)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if (
                        0 <= ny < h
                        and 0 <= nx < w
                        and mask[ny, nx]
                        and not seen[ny, nx]
                    ):
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            if len(xs) >= min_pixels:
                boxes.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1, len(xs)))
    return boxes


def segments(
    image_bytes: bytes,
    patch_features,
    k: int = 10,
    min_area: float = 0.008,
    max_area: float = 0.35,
    max_items: int = 12,
) -> list[dict]:
    """Семантические сегменты по patch-фичам DINOv2 → связные области на белом.

    Кластеры patch-фич дают семантические зоны; внутри каждой берём связные
    компоненты и отбрасываем «фон» (слишком большие области) и мелочь.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    small = image.resize((SEG_SIZE, SEG_SIZE))
    feat = np.asarray(patch_features(image_bytes))
    if feat.ndim != 3:
        raise ValueError("patch_features должен вернуть (h, w, dim)")
    h, w, dim = feat.shape
    labels, _ = kmeans(feat.reshape(-1, dim), k)
    labels = labels.reshape(h, w)
    total = SEG_SIZE * SEG_SIZE
    min_pixels = max(16, int(total * min_area))
    max_pixels = int(total * max_area)
    items: list[dict] = []
    for cluster in range(int(labels.max()) + 1):
        mask = labels == cluster
        if int(mask.sum()) == 0:
            continue
        mask_img = Image.fromarray((mask * 255).astype(np.uint8)).resize(
            (SEG_SIZE, SEG_SIZE), Image.NEAREST
        )
        arr = np.asarray(mask_img) > 127
        for box in _component_boxes(arr, min_pixels):
            x0, y0, x1, y1, area = box
            if area > max_pixels:
                continue
            # Слишком вытянутые/тонкие области обычно фон/стены — пропускаем.
            if (x1 - x0) < 8 or (y1 - y0) < 8:
                continue
            crop = small.crop((x0, y0, x1, y1))
            items.append(
                {
                    "index": len(items),
                    "kind": "segment",
                    "area": int(area),
                    "label": "сегмент",
                    "thumb_b64": _encode(_card(crop)),
                }
            )
    items.sort(key=lambda item: item["area"], reverse=True)
    for i, item in enumerate(items):
        item["index"] = i
        item["label"] = f"сегмент {i + 1}"
    return items[:max_items]
