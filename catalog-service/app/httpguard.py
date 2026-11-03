"""SSRF-защита для фидов и картинок."""

from __future__ import annotations

import ipaddress
from urllib.parse import urlparse

BLOCKED_HOSTNAMES = {
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "metadata",
    "instance-data",
}


def is_public_http_url(url: str) -> bool:
    """Разрешает только http(s) на публичный хост/адрес.

    Литеральные частные/loopback/link-local/reserved адреса отвергаются.
    Для доменных имён DNS-проверка выполняется в момент загрузки.
    """
    try:
        parsed = urlparse(str(url or "").strip())
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").strip().lower().strip(".")
    if not host:
        return False
    if host in BLOCKED_HOSTNAMES or host.endswith(".local"):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return True
    return ip.is_global
