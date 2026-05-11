"""Smoke tests — exercise the seeded state and the read-only API surface.

These are intentionally thin. Their job is to catch "the repo doesn't
boot" regressions, not to cover behavior.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from crawl.models import Domain, Page, PageLink


class SeedDataTests(TestCase):
    """Fixture-level sanity on what 0002_seed_data produced."""

    def test_three_domains_seeded(self):
        self.assertEqual(Domain.objects.count(), 3)
        hosts = set(Domain.objects.values_list('host', flat=True))
        self.assertEqual(hosts, {'acmewidgets.com', 'globaltech.io', 'sampleshop.net'})

    def test_pages_and_links_seeded(self):
        self.assertGreater(Page.objects.count(), 100)
        self.assertGreater(PageLink.objects.count(), 1000)

    def test_all_three_enrichment_freshness_states_present(self):
        fresh = Domain.objects.filter(
            authority_fetched_at__isnull=False, authority_score__isnull=False
        ).count()
        never = Domain.objects.filter(
            authority_score__isnull=True, authority_fetched_at__isnull=True
        ).count()
        self.assertGreaterEqual(fresh, 1)
        self.assertGreaterEqual(never, 1)


class ReadApiTests(TestCase):
    """The read-only endpoints return the shape the frontend expects."""

    def setUp(self):
        self.client = APIClient()

    def test_domains_list(self):
        resp = self.client.get('/api/domains/')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn('results', body)
        self.assertEqual(body['count'], 3)
        first = body['results'][0]
        for field in ('id', 'host', 'registered_domain', 'tld', 'page_count'):
            self.assertIn(field, first)

    def test_pages_list(self):
        resp = self.client.get('/api/pages/?page_size=5')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertIn('results', body)
        self.assertGreater(body['count'], 0)
        first = body['results'][0]
        for field in ('id', 'url', 'http_status', 'host', 'title'):
            self.assertIn(field, first)

    def test_stats(self):
        resp = self.client.get('/api/stats/')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        for field in ('total_domains', 'total_pages', 'pages_2xx', 'total_backlinks'):
            self.assertIn(field, body)
        self.assertEqual(body['total_domains'], 3)
