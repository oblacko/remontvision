"""Семантическая сегментация DINOv2 (ADE20K linear head) → маски/контуры.

Голова: BN + 1×1 conv на фичах последнего блока ViT-B (out_indices=[8,9,10,11],
in_index=[3], 150 классов ADE20K). Замороженный backbone — наш TorchEmbedder.
"""

from __future__ import annotations

import base64
import io
import os
import threading
import urllib.request

import numpy as np
from PIL import Image

from . import ade20k, imaging

HEAD_URL = "https://dl.fbaipublicfiles.com/dinov2/dinov2_vitb14/dinov2_vitb14_ade20k_linear_head.pth"
HEAD_PATH = "/root/.cache/dino_seg/dinov2_vitb14_ade20k_linear_head.pth"
SIZE = 512
MAX_SIDE = 1024
MIN_AREA = 0.002
MAX_AREA = 0.6

_lock = threading.Lock()
_head = None


def _ensure_head():
    global _head
    if _head is not None:
        return _head
    with _lock:
        if _head is not None:
            return _head
        import torch

        if not os.path.exists(HEAD_PATH):
            os.makedirs(os.path.dirname(HEAD_PATH), exist_ok=True)
            urllib.request.urlretrieve(HEAD_URL, HEAD_PATH)
        state = torch.load(HEAD_PATH, map_location="cpu")["state_dict"]
        bn = torch.nn.BatchNorm2d(768)
        conv = torch.nn.Conv2d(768, 150, 1)
        bn.load_state_dict(
            {
                key.replace("decode_head.bn.", ""): value
                for key, value in state.items()
                if key.startswith("decode_head.bn.")
            }
        )
        conv.load_state_dict(
            {
                key.replace("decode_head.conv_seg.", ""): value
                for key, value in state.items()
                if key.startswith("decode_head.conv_seg.")
            }
        )
        bn.eval()
        conv.eval()
        _head = (bn, conv)
        return _head


def label_map(image: Image.Image, embedder) -> np.ndarray:
    model = getattr(embedder, "_model", None)
    torch = getattr(embedder, "_torch", None)
    if model is None or torch is None:
        raise RuntimeError("Сегментация доступна только с EMBEDDER=torch")
    bn, conv = _ensure_head()
    width, height = image.size
    scale = SIZE / max(1, min(width, height))
    if max(width, height) * scale > MAX_SIDE:
        scale = MAX_SIDE / max(width, height)
    new_w = max(14, int(round(width * scale / 14)) * 14)
    new_h = max(14, int(round(height * scale / 14)) * 14)
    resized = image.resize((new_w, new_h), Image.LANCZOS)
    array = np.asarray(resized, dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    tensor = (
        torch.from_numpy((array - mean) / std).permute(2, 0, 1).unsqueeze(0).float()
    )
    with torch.no_grad():
        features = model.forward_intermediates(
            tensor,
            indices=[8, 9, 10, 11],
            norm=True,
            output_fmt="NCHW",
            intermediates_only=True,
        )
        logits = conv(bn(features[-1]))
        logits = torch.nn.functional.interpolate(
            logits, size=(new_h, new_w), mode="bilinear", align_corners=False
        )
        labels = logits.argmax(1)[0].cpu().numpy().astype(np.uint8)
    return np.asarray(Image.fromarray(labels).resize((width, height), Image.NEAREST))


def _class_name(index: int) -> str:
    if 0 <= index < len(ade20k.ADE20K_CLASSES):
        return ade20k.ADE20K_CLASSES[index]
    return f"class_{index}"


def _component_at(labels: np.ndarray, class_index: int, x: int, y: int):
    mask = labels == class_index
    if not mask[y, x]:
        return None
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    stack = [(y, x)]
    seen[y, x] = True
    xs: list[int] = []
    ys: list[int] = []
    while stack:
        cy, cx = stack.pop()
        xs.append(cx)
        ys.append(cy)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                stack.append((ny, nx))
    comp = np.zeros_like(mask, dtype=bool)
    comp[np.array(ys), np.array(xs)] = True
    return comp


def _components(labels: np.ndarray, limit: int) -> list[dict]:
    total = labels.shape[0] * labels.shape[1]
    items: list[dict] = []
    for raw_index in np.unique(labels):
        index = int(raw_index)
        name = _class_name(index)
        category = ade20k.ADE_TO_INTERNAL.get(name)
        if not category:
            continue
        mask = labels == index
        for box in imaging._component_boxes(mask, max(16, int(total * MIN_AREA))):
            x0, y0, x1, y1, area = box
            if area > int(total * MAX_AREA):
                continue
            if (x1 - x0) < 8 or (y1 - y0) < 8:
                continue
            items.append(
                {
                    "class_index": index,
                    "class_name": name,
                    "category": category,
                    "area": int(area),
                    "bbox": [int(x0), int(y0), int(x1), int(y1)],
                }
            )
    items.sort(key=lambda item: item["area"], reverse=True)
    return items[:limit]


def _overlay(image: Image.Image, labels: np.ndarray) -> str:
    base = np.asarray(image.convert("RGB"), dtype=np.float32)
    colors = np.zeros_like(base)
    for raw_index in np.unique(labels):
        index = int(raw_index)
        name = _class_name(index)
        if not ade20k.ADE_TO_INTERNAL.get(name):
            colors[labels == index] = (90, 90, 90)
            continue
        rng = np.random.default_rng(index + 17)
        colors[labels == index] = rng.integers(50, 255, 3)
    blended = np.clip(base * 0.55 + colors * 0.45, 0, 255).astype(np.uint8)
    buffer = io.BytesIO()
    Image.fromarray(blended).save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


def segment(image_bytes: bytes, embedder, max_items: int = 15) -> dict:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    labels = label_map(image, embedder)
    array = np.asarray(image)
    items: list[dict] = []
    for item in _components(labels, max_items * 3):
        x0, y0, x1, y1 = item["bbox"]
        mask = np.zeros(labels.shape, dtype=bool)
        mask[y0:y1, x0:x1] = labels[y0:y1, x0:x1] == item["class_index"]
        item["label"] = f"{item['class_name']} → {item['category']}"
        item["thumb_b64"] = imaging.masked_card(array, mask)
        items.append(item)
        if len(items) >= max_items:
            break
    return {"overlay_b64": _overlay(image, labels), "items": items}


def mask_at(image_bytes: bytes, embedder, x_frac: float, y_frac: float) -> dict:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    labels = label_map(image, embedder)
    height, width = labels.shape
    x = min(width - 1, max(0, int(float(x_frac) * width)))
    y = min(height - 1, max(0, int(float(y_frac) * height)))
    index = int(labels[y, x])
    name = _class_name(index)
    category = ade20k.ADE_TO_INTERNAL.get(name)
    comp = _component_at(labels, index, x, y)
    if comp is None:
        raise RuntimeError("не удалось выделить объект под кликом")
    ys, xs = np.where(comp)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    return {
        "label": f"{name} → {category}" if category else name,
        "category": category,
        "class_name": name,
        "bbox": bbox,
        "thumb_b64": imaging.masked_card(np.asarray(image), comp),
    }
