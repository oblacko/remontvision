"""Эмбеддеры: интерфейс, детерминированный фейк и ленивый torch/DINOv2."""

from __future__ import annotations

import hashlib
import math
import os
import random
from typing import Protocol

from . import vectors


class Embedder(Protocol):
    dim: int
    model: str

    def embed_image(self, image_bytes: bytes) -> list[float]: ...

    def embed_text(self, text: str) -> list[float]: ...


class FakeEmbedder:
    """Детерминированный эмбеддер для тестов и локального запуска без torch.

    Одинаковый вход даёт одинаковый единичный вектор, разные входы — разные.
    """

    def __init__(self, dim: int = 1280, model: str = "fake"):
        self.dim = dim
        self.model = model

    def _hash_vector(self, payload: bytes) -> list[float]:
        digest = hashlib.sha256(payload).digest()
        seed = int.from_bytes(digest[:8], "big")
        rng = random.Random(seed)
        raw = [rng.uniform(-1.0, 1.0) for _ in range(self.dim)]
        return vectors.normalize(raw)

    def embed_image(self, image_bytes: bytes) -> list[float]:
        return self._hash_vector(b"image:" + bytes(image_bytes))

    def embed_text(self, text: str) -> list[float]:
        return self._hash_vector(b"text:" + str(text).encode("utf-8"))


class TorchEmbedder:
    """Семантические эмбеддинги DINOv2 через timm (image→image).

    По умолчанию DINOv2 ViT-B/14 (768d): заметно быстрее ViT-L на CPU и уже
    даёт семантику «кровать → кровати», в отличие от цветового histogram.
    Текст не поддерживает — text→image потребует отдельной интеграции dino.txt.
    """

    def __init__(self, dim: int = 768, model: str = "vit_base_patch14_dinov2.lvd142m"):
        self.dim = dim
        self.model = model
        try:
            import timm
            import torch
            from PIL import Image  # noqa: F401
        except ImportError as exc:  # pragma: no cover - зависит от окружения
            raise RuntimeError(
                "TorchEmbedder требует torch, timm и pillow. "
                "Соберите образ с INSTALL_ML=1 или задайте EMBEDDER=histogram."
            ) from exc
        self._torch = torch
        # При параллельном инференсе лучше 1 поток на вызов (см. EMBED_CONCURRENCY).
        torch.set_num_threads(max(1, int(os.environ.get("EMBED_TORCH_THREADS", "1"))))
        self._model = timm.create_model(
            model, pretrained=True, num_classes=0, dynamic_img_size=True
        )
        self._model.eval()
        data_config = timm.data.resolve_model_data_config(self._model)
        size = max(112, int(os.environ.get("EMBED_IMAGE_SIZE", "224")))
        self._transform = timm.data.create_transform(
            input_size=(3, size, size),
            mean=data_config.get("mean", (0.485, 0.456, 0.406)),
            std=data_config.get("std", (0.229, 0.224, 0.225)),
            is_training=False,
        )
        out_dim = int(getattr(self._model, "num_features", dim) or dim)
        if out_dim != dim:
            raise RuntimeError(
                f"EMBED_DIM={dim} не совпадает с моделью {model} ({out_dim}d)"
            )

    def embed_image(self, image_bytes: bytes) -> list[float]:  # pragma: no cover
        import io

        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        tensor = self._transform(image).unsqueeze(0)
        with self._torch.no_grad():
            features = self._model(tensor)
        return vectors.normalize(features.squeeze(0).tolist())

    def embed_text(self, text: str) -> list[float]:  # pragma: no cover
        raise RuntimeError(
            "Текстовый поиск требует dino.txt; сейчас доступен image→image (DINOv2/timm)."
        )

    def patch_features(self, image_bytes: bytes):  # pragma: no cover
        """Patch-токены DINOv2 (h×w×dim) для семантической сегментации."""
        import io

        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((224, 224))
        tensor = self._transform(image).unsqueeze(0)
        with self._torch.no_grad():
            tokens = self._model.forward_features(tensor)
        prefix = int(getattr(self._model.patch_embed, "num_prefix_tokens", 1) or 1)
        patches = tokens[:, prefix:, :]
        n = int(patches.shape[1])
        h = int(round(math.sqrt(n)))
        w = n // h if h else 0
        feat = patches[0, : h * w, :].reshape(h, w, -1).cpu().numpy()
        return feat


class HistogramEmbedder:
    """Лёгкий визуальный дескриптор (цвет + грубая пространственная сетка).

    Нужен для локального тестирования поиска без torch. Это НЕ семантические
    эмбеддинги DINOv2, но картинки похожего цвета/композиции сближаются.
    Текст не поддерживает — для text→image используйте DINOv2 (EMBEDDER=torch).
    """

    def __init__(self, dim: int = 1280, model: str = "histogram-v1"):
        self.dim = dim
        self.model = model

    def embed_image(self, image_bytes: bytes) -> list[float]:
        import io

        import numpy as np
        from PIL import Image

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        spatial = (
            np.asarray(image.resize((16, 16)), dtype=np.float32).reshape(-1) / 255.0
        )
        small = np.asarray(image.resize((64, 64)), dtype=np.float32) / 255.0
        idx = np.clip((small * 7).astype(np.int32), 0, 7)
        hist = np.zeros((8, 8, 8), dtype=np.float32)
        np.add.at(hist, (idx[..., 0], idx[..., 1], idx[..., 2]), 1.0)
        hist = hist.reshape(-1) / max(float(hist.sum()), 1.0)
        vec = np.concatenate([spatial, hist])
        if self.dim < vec.size:
            vec = vec[: self.dim]
        elif self.dim > vec.size:
            vec = np.pad(vec, (0, self.dim - vec.size))
        return vectors.normalize(vec.tolist())

    def embed_text(self, text: str) -> list[float]:
        raise RuntimeError(
            "HistogramEmbedder не поддерживает текст; используйте DINOv2 (EMBEDDER=torch)"
        )


def get_embedder(settings) -> Embedder:
    if settings.embedder == "histogram":
        return HistogramEmbedder(dim=settings.embed_dim)
    if settings.embedder == "fake":
        return FakeEmbedder(dim=settings.embed_dim, model="fake")
    return TorchEmbedder(dim=settings.embed_dim, model=settings.embed_model)
