import io

from PIL import Image

from app import gridai


def test_build_grid_prompt_includes_objects():
    objects = [
        {
            "label": "Кровать",
            "description": "деревянная",
            "color": "беж",
            "material": "дуб",
            "size": "160x200",
        },
        {
            "label": "Лампа",
            "description": "подвес",
            "color": "белый",
            "material": "металл",
        },
    ]
    prompt = gridai.build_grid_prompt(objects)
    assert "Кровать" in prompt and "Лампа" in prompt
    assert "{objects}" not in prompt
    assert "2 ряда × 5 колонок" in prompt


def test_slice_grid_returns_ten_cells():
    image = Image.new("RGB", (2100, 900), (255, 255, 255))
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    items = gridai.slice_grid(buf.getvalue(), labels=[f"item{i}" for i in range(10)])
    assert len(items) == 10
    assert items[0]["label"] == "item0"
    assert items[9]["thumb_b64"]


def test_slice_grid_includes_product_attributes():
    image = Image.new('RGB', (2100, 900), (255, 255, 255))
    buf = io.BytesIO()
    image.save(buf, format='PNG')
    products = [
        {'label': 'Кровать', 'color': 'беж', 'material': 'дуб', 'category': 'bed'}
        for _ in range(10)
    ]
    items = gridai.slice_grid(buf.getvalue(), labels=[f'i{i}' for i in range(10)], products=products)
    assert items[0]['product'] == {'label': 'Кровать', 'color': 'беж', 'material': 'дуб', 'category': 'bed'}
