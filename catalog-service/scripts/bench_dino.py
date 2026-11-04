#!/usr/bin/env python3
"""Сравнение DINOv2 (timm) и DINOv3 (transformers) на товарах каталога.

Запуск внутри окружения с torch/timm (и transformers>=4.56 для DINOv3):

  # из папки с изображениями и labels.json
  python scripts/bench_dino.py --images-dir ./bench/images --labels ./bench/labels.json --limit 200

  # напрямую из БД каталога (скачает картинки)
  python scripts/bench_dino.py --db "$CATALOG_DATABASE_URL" --feed-id 2 --category curtain --limit 200

Что меряем:
  - время эмбеддинга на картинку (CPU);
  - instance Top-1/Top-3 (тот же товар) на аугментациях запроса;
  - category Top-1/Top-3 (та же категория).
"""

from __future__ import annotations

import argparse
import io
import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

DINO2_DEFAULT = "vit_base_patch14_dinov2.lvd142m"
DINO3_DEFAULT = "facebook/dinov3-vits16-pretrain-lvd1689m"


def normalize(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    return vec / norm if norm else vec


def load_images_dir(path: str, limit: int | None):
    files = sorted(Path(path).glob("*"))
    files = [f for f in files if f.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}]
    if limit:
        files = files[:limit]
    return [(f.name, Image.open(f).convert("RGB")) for f in files]


def load_from_db(dsn: str, feed_id: int | None, category: str | None, limit: int):
    import httpx
    import psycopg
    from psycopg.rows import dict_row

    where = ["picture_url IS NOT NULL"]
    params: list = []
    if feed_id is not None:
        where.append("feed_id = %s")
        params.append(feed_id)
    if category:
        where.append("category = %s")
        params.append(category)
    sql = (
        "SELECT external_id, category, picture_url FROM offers "
        f"WHERE {' AND '.join(where)} ORDER BY random() LIMIT %s"
    )
    params.append(limit)
    with psycopg.connect(dsn, row_factory=dict_row) as conn:
        rows = conn.execute(sql, params).fetchall()

    def fetch(row):
        try:
            data = httpx.get(
                row["picture_url"], timeout=30, follow_redirects=True
            ).content
            return (
                row["external_id"],
                row["category"],
                Image.open(io.BytesIO(data)).convert("RGB"),
            )
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=12) as pool:
        items = [x for x in pool.map(fetch, rows) if x]
    return [(eid, img) for eid, _cat, img in items], {
        eid: cat for eid, cat, _img in items
    }


def augment(image: Image.Image, kind: str) -> Image.Image:
    w, h = image.size
    if kind == "center_crop":
        box = (int(w * 0.075), int(h * 0.075), int(w * 0.925), int(h * 0.925))
        return image.crop(box)
    if kind == "bright":
        return ImageEnhance.Brightness(image).enhance(1.12)
    if kind == "resize":
        return image.resize((max(2, int(w * 0.85)), max(2, int(h * 0.85))))
    return image


def load_dino2(name: str):
    import timm

    model = timm.create_model(
        name, pretrained=True, num_classes=0, dynamic_img_size=True
    )
    model.eval()
    cfg = timm.data.resolve_model_data_config(model)
    transform = timm.data.create_transform(
        input_size=(3, 224, 224),
        mean=cfg.get("mean", (0.485, 0.456, 0.406)),
        std=cfg.get("std", (0.229, 0.224, 0.225)),
        is_training=False,
    )

    def embed(image):
        import torch

        tensor = transform(image).unsqueeze(0)
        with torch.no_grad():
            feat = model(tensor)
        return normalize(feat.squeeze(0).numpy())

    return embed


def load_dino3(name: str, token: str | None):
    from transformers import AutoImageProcessor, AutoModel

    model = AutoModel.from_pretrained(name, token=token)
    model.eval()
    processor = AutoImageProcessor.from_pretrained(name, token=token)

    def embed(image):
        import torch

        inputs = processor(images=image, return_tensors="pt")
        with torch.inference_mode():
            outputs = model(**inputs)
        feat = (
            outputs.pooler_output
            if getattr(outputs, "pooler_output", None) is not None
            else outputs.last_hidden_state[:, 0]
        )
        return normalize(feat.squeeze(0).numpy())

    return embed


def evaluate(name, embed, items, labels, augs):
    t0 = time.time()
    gallery = [(eid, embed(img)) for eid, img in items]
    gal_time = time.time() - t0
    ids = [eid for eid, _ in gallery]
    mat = np.stack([v for _, v in gallery])
    results = {}
    for aug in augs:
        inst1 = inst3 = cat1 = cat3 = 0
        t0 = time.time()
        for eid, img in items:
            q = embed(augment(img, aug))
            scores = mat @ q
            order = np.argsort(-scores)
            top = [ids[i] for i in order[:3]]
            inst1 += top[0] == eid
            inst3 += eid in top
            cat = labels.get(eid)
            top_cats = [labels.get(x) for x in top]
            cat1 += top_cats[0] == cat
            cat3 += cat in top_cats
        elapsed = time.time() - t0
        n = len(items)
        results[aug] = {
            "n": n,
            "ms_per_image": round(1000 * elapsed / max(1, n), 1),
            "instance_top1": round(100 * inst1 / n, 1),
            "instance_top3": round(100 * inst3 / n, 1),
            "category_top1": round(100 * cat1 / n, 1),
            "category_top3": round(100 * cat3 / n, 1),
        }
    results["_gallery_ms"] = round(1000 * gal_time / max(1, len(items)), 1)
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--images-dir")
    parser.add_argument("--labels")
    parser.add_argument("--db")
    parser.add_argument("--feed-id", type=int)
    parser.add_argument("--category")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--dino2", default=DINO2_DEFAULT)
    parser.add_argument("--dino3", default=DINO3_DEFAULT)
    parser.add_argument("--hf-token", default=os.environ.get("HF_TOKEN"))
    parser.add_argument("--skip-dino3", action="store_true")
    args = parser.parse_args()

    labels = {}
    if args.db:
        items, labels = load_from_db(args.db, args.feed_id, args.category, args.limit)
    else:
        items = load_images_dir(args.images_dir, args.limit)
        if args.labels:
            raw = json.loads(Path(args.labels).read_text())
            labels = {
                k: (v["category"] if isinstance(v, dict) else v) for k, v in raw.items()
            }
    if not items:
        raise SystemExit("нет изображений")
    print(f"images: {len(items)}, categories: {len(set(labels.values()))}")

    augs = ["center_crop", "bright", "resize"]
    report = {}
    print("\n=== DINOv2 ===")
    report["dino2"] = evaluate("dino2", load_dino2(args.dino2), items, labels, augs)
    for aug, m in report["dino2"].items():
        print(aug, m)
    if not args.skip_dino3:
        print("\n=== DINOv3 ===")
        try:
            report["dino3"] = evaluate(
                "dino3", load_dino3(args.dino3, args.hf_token), items, labels, augs
            )
            for aug, m in report["dino3"].items():
                print(aug, m)
        except Exception as exc:  # noqa: BLE001
            print("DINOv3 недоступен:", exc)
            print("Нужны: transformers>=4.56, доступ к весам и HF_TOKEN.")
    print("\nJSON:", json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
