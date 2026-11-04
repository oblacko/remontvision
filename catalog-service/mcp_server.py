"""MCP-сервер каталога (stdio). Запуск: python /app/mcp_server.py."""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from app import catalog_tools as tools

mcp = FastMCP("catalog")


@mcp.tool()
def list_categories() -> list[dict]:
    """Список категорий каталога (ключ и русское название)."""
    return tools.list_categories()


@mcp.tool()
def search_offers(
    query: str = "",
    category: str | None = None,
    color: str | None = None,
    material: str | None = None,
    product_type: str | None = None,
    size: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    """Поиск реальных товаров каталога по категории, словам и атрибутам."""
    return tools.search_offers(
        query=query,
        category=category,
        color=color,
        material=material,
        product_type=product_type,
        size=size,
        top_k=top_k,
    )


@mcp.tool()
def category_stats(category: str) -> dict:
    """Сколько товаров в категории и какие реальные цвета/материалы в ней есть."""
    return tools.category_stats(category)


@mcp.tool()
def get_offer(offer_id: str) -> dict:
    """Карточка конкретного товара по offer_id."""
    return tools.get_offer(offer_id)


@mcp.tool()
def resolve_category(label: str) -> dict:
    """Сопоставить свободное название категории с ключом каталога."""
    return tools.resolve_category(label)


if __name__ == "__main__":
    mcp.run()
