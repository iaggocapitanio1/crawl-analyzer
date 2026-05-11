"""External enrichment provider clients.

These call out to third-party SEO data providers for domain authority,
backlink counts, and page-level SEO scores. Each call is billable and
rate-limited upstream, so treat them like any other slow external API.
"""
import hashlib
import time


_EXTERNAL_API_LATENCY_SECONDS = 1.5


def _deterministic_score(key: str, modulo: int) -> int:
    digest = hashlib.sha256(key.encode('utf-8')).hexdigest()
    return int(digest[:8], 16) % modulo


def fetch_domain_authority(host: str) -> int:
    """Domain Authority score (0-100). Typical provider latency."""
    time.sleep(_EXTERNAL_API_LATENCY_SECONDS)
    return _deterministic_score(f'da:{host}', 101)


def fetch_backlink_count(host: str) -> int:
    """Total inbound backlinks to a host."""
    time.sleep(_EXTERNAL_API_LATENCY_SECONDS)
    return _deterministic_score(f'bl:{host}', 50000)


def fetch_page_seo_score(url: str) -> int:
    """Page-level SEO score (0-100)."""
    time.sleep(_EXTERNAL_API_LATENCY_SECONDS)
    return _deterministic_score(f'seo:{url}', 101)
