import random
from datetime import timedelta

import tldextract
from django.core.management.base import BaseCommand
from django.utils import timezone
from faker import Faker

from crawl.models import Domain


class Command(BaseCommand):
    help = "Insert N fake domains into the database (bulk)."

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=10_000)
        parser.add_argument('--batch-size', type=int, default=1000)
        parser.add_argument('--seed', type=int, default=None)

    def handle(self, *args, **options):
        count = options['count']
        batch_size = options['batch_size']
        seed = options['seed']

        faker = Faker()
        if seed is not None:
            Faker.seed(seed)
            random.seed(seed)

        now = timezone.now()
        existing_hosts = set(Domain.objects.values_list('host', flat=True))
        self.stdout.write(f"Generating {count} unique fake domains...")

        hosts: set[str] = set()
        attempts = 0
        max_attempts = count * 5
        while len(hosts) < count and attempts < max_attempts:
            host = faker.domain_name()
            if host not in existing_hosts and host not in hosts:
                hosts.add(host)
            attempts += 1

        if len(hosts) < count:
            self.stdout.write(self.style.WARNING(
                f"Only generated {len(hosts)} unique hosts after {attempts} attempts."
            ))

        domains: list[Domain] = []
        for host in hosts:
            ext = tldextract.extract(host)
            registered = ext.registered_domain or host
            tld = ext.suffix or ''
            first_seen = now - timedelta(days=random.randint(0, 365))
            last_seen = first_seen + timedelta(days=random.randint(0, 30))
            domains.append(Domain(
                host=host,
                registered_domain=registered,
                tld=tld,
                first_seen_at=first_seen,
                last_seen_at=last_seen,
                page_count=random.randint(0, 500),
                authority_score=random.choice([None, random.randint(1, 100)]),
                authority_fetched_at=random.choice([None, last_seen]),
                backlink_count=random.choice([None, random.randint(0, 50_000)]),
                backlinks_fetched_at=random.choice([None, last_seen]),
            ))

        created = Domain.objects.bulk_create(
            domains, batch_size=batch_size, ignore_conflicts=True
        )
        self.stdout.write(self.style.SUCCESS(
            f"Inserted {len(created)} domains (requested {count})."
        ))
