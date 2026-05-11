---
name: django-celery-patterns
description: Apply when creating or modifying Celery tasks in a Django project. Covers transaction safety, idempotency, retry policies, queue routing, and observability.
---

# Django + Celery patterns

## 1. Always dispatch via on_commit

NEVER `task.delay()` inside (or after) an atomic block — the task may run before the transaction commits, reading stale or non-existent data.

```python
# WRONG — task can fire before commit
def create_crawl(site_id):
    crawl = Crawl.objects.create(site_id=site_id)
    process_crawl.delay(crawl.id)

# RIGHT
from django.db import transaction

def create_crawl(site_id):
    crawl = Crawl.objects.create(site_id=site_id)
    transaction.on_commit(lambda: process_crawl.delay(crawl.id))
```

If `ATOMIC_REQUESTS=True` (per-request transactions), even view-level `.delay()` needs `on_commit`. Just use `on_commit` everywhere — it's safe outside transactions too.

## 2. Arguments = IDs, never instances

Workers may run minutes later — serialized instances are stale on arrival.

```python
# WRONG
process_crawl.delay(crawl)  # serialized snapshot

# RIGHT
process_crawl.delay(crawl.id)

@shared_task
def process_crawl(crawl_id):
    crawl = Crawl.objects.get(id=crawl_id)  # always fresh
```

## 3. Idempotency is required

Tasks WILL re-run (worker crash, broker retry, dup dispatch). Every task must be safe to run 2x.

```python
@shared_task
def send_report(report_id):
    with transaction.atomic():
        report = Report.objects.select_for_update().get(id=report_id)
        if report.status == Report.Status.SENT:
            return  # idempotent: skip
        ... send email ...
        report.status = Report.Status.SENT
        report.save()
```

Strategies:
- **Status check** + `select_for_update` (above)
- **Unique constraint** on a derived key — DB rejects dupe
- **Redis advisory lock** for non-DB external work

## 4. Retry with exponential backoff

```python
@shared_task(
    bind=True,
    autoretry_for=(requests.RequestException, TimeoutError),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
)
def fetch_serp(self, keyword_id):
    ...
```

Rules:
- NEVER `max_retries=None` — bound it.
- `retry_jitter=True` to avoid thundering-herd retries.
- Don't retry on logic errors (ValueError, KeyError) — only on transient failures.

## 5. Queue routing by SLA

SearchAtlas has work with different SLAs — separate queues so a slow crawl doesn't block a webhook:

| Queue | Use for | Latency budget |
|---|---|---|
| `fast` | webhooks, notifications, small DB ops | < 5s |
| `crawl` | SERP fetches, scrapes | 10s – 10min |
| `heavy` | report generation, bulk re-index | > 10min |

```python
@shared_task(queue='crawl')
def fetch_serp(keyword_id):
    ...
```

In settings:
```python
CELERY_TASK_ROUTES = {
    'crawls.tasks.fetch_serp': {'queue': 'crawl'},
    'reports.tasks.generate': {'queue': 'heavy'},
    'webhooks.tasks.*': {'queue': 'fast'},
}
```

Run separate workers per queue:
```bash
celery -A searchatlas worker -Q fast --concurrency=8
celery -A searchatlas worker -Q crawl --concurrency=4
celery -A searchatlas worker -Q heavy --concurrency=2
```

## 6. Dead-letter for poison messages

Tasks that exhaust retries should land somewhere visible — don't silently drop:

```python
@shared_task(bind=True, max_retries=5)
def fetch_serp(self, keyword_id):
    try:
        ...
    except Exception as exc:
        if self.request.retries >= self.max_retries:
            DeadLetter.objects.create(
                task='fetch_serp',
                payload={'keyword_id': keyword_id},
                error=repr(exc),
                traceback=traceback.format_exc(),
            )
            return  # don't re-raise, we've handled it
        raise self.retry(exc=exc)
```

## 7. Periodic tasks — use django-celery-beat

DB-backed schedules survive restarts and can be edited in admin. NEVER hardcode schedules in `CELERYBEAT_SCHEDULE` for anything operational.

```python
# In Django admin:
# PeriodicTask: name="hourly crawl refresh", task="crawls.tasks.refresh_pending"
# CrontabSchedule: 0 * * * *
```

## 8. Observability minimums

- Every task: log start, end, duration, args (sanitized)
- Use `task_prerun` / `task_postrun` signals for metrics (Prometheus exporter)
- Flower in dev for visibility (`celery -A searchatlas flower`)
- Sentry integration for unhandled exceptions
- Track queue depth — alert when `crawl` queue > 1000 pending

## 9. Workflow patterns

- **Chain** (sequential): `chain(fetch_serp.s(kw), parse_serp.s(), index_serp.s())()`
- **Group** (parallel fan-out): `group(fetch_serp.s(kw_id) for kw_id in ids).apply_async()`
- **Chord** (fan-out + callback): `chord([fetch_serp.s(kw_id) for kw_id in ids], generate_report.s(report_id)).apply_async()`

Don't over-use Canvas — for simple fan-out, a parent task that loops `.delay()` is often clearer.
