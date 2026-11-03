#!/usr/bin/env python3
"""Спайк: сравнить картинки каталога с кропами запросов через DINOv2.

Throwaway-скрипт (не входит в прод-путь сервиса). Нужен, чтобы до интеграции
зафиксировать размерность dino.txt-пространства и порог min_score на
размеченных примерах.

Запуск (в образе с torch, INSTALL_ML=1):
    python scripts/spike_dino.py \
        --catalog-dir ./tmp/catalog \
        --queries-dir ./tmp/queries \
        --model dinov2_vitl14_reg4_dinotxt

Ожидается: catalog/*.jpg — картинки офферов, queries/*.jpg — кропы объектов.
Печатает Top-1/Top-3 для каждого запроса и cosine-скоры.
"""

from __future__ import annotations

import argparse
import pathlib

import torch
from PIL import Image
from torchvision import transforms

MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)
TF = transforms.Compose(
    [
        transforms.Resize(256),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ]
)


def embed(model, path: pathlib.Path) -> torch.Tensor:
    image = Image.open(path).convert("RGB")
    tensor = TF(image).unsqueeze(0)
    with torch.no_grad():
        out = model(tensor)
    vec = out[0] if isinstance(out, (tuple, list)) else out
    vec = vec.squeeze(0)
    return vec / vec.norm()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--catalog-dir", required=True)
    parser.add_argument("--queries-dir", required=True)
    parser.add_argument("--model", default="dinov2_vitl14_reg4_dinotxt")
    parser.add_argument("--top", type=int, default=3)
    args = parser.parse_args()

    model = torch.hub.load("facebookresearch/dinov2", args.model)
    model.eval()

    catalog = sorted(pathlib.Path(args.catalog_dir).glob("*.jpg"))
    queries = sorted(pathlib.Path(args.queries_dir).glob("*.jpg"))
    if not catalog or not queries:
        raise SystemExit("Нужны .jpg в --catalog-dir и --queries-dir")

    catalog_vecs = {p.name: embed(model, p) for p in catalog}
    hits = 0
    for query in queries:
        qv = embed(model, query)
        scored = sorted(
            ((float(qv @ vec), name) for name, vec in catalog_vecs.items()),
            reverse=True,
        )
        top = scored[: args.top]
        print(f"\n{query.name}: dim={qv.numel()}")
        for rank, (score, name) in enumerate(top, 1):
            print(f"  #{rank} {score:.4f}  {name}")
        # Ручная разметка: имя запроса содержит ожидаемое имя каталога.
        if (
            top
            and query.stem.split("__")[0] == pathlib.Path(top[0][1]).stem.split("__")[0]
        ):
            hits += 1
    print(f"\nTop-1 (по имени): {hits}/{len(queries)}")


if __name__ == "__main__":
    main()
