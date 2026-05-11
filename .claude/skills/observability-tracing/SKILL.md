---
name: observability-tracing
description: Apply when instrumenting code with traces/errors, defining spans, propagating context across HTTP/Celery/DB boundaries, choosing span attributes/tags, configuring sampling, or wiring Sentry. SearchAtlas uses sentry-sdk directly — no OpenTelemetry abstraction layer, no opentelemetry-instrumentation-* packages. Errors AND traces land in Sentry SaaS.
---

# Observability — tracing with sentry-sdk

Tracing is the connective tissue between Django web, Celery workers, and the DB. SearchAtlas uses **sentry-sdk directly** — Sentry's `DjangoIntegration` and `CeleryIntegration` provide auto-instrumentation, and custom work uses `sentry_sdk.start_span(...)`. **No OpenTelemetry layer.**

This skill is **only about traces**. Logs and metrics are adjacent — covered briefly in §10.

## 1. Rule zero: sentry-sdk directly, no OTel

ALWAYS:
```python
import sentry_sdk

with sentry_sdk.start_span(op="crawl.fetch_serp", description=f"keyword={keyword_id}") as span:
    span.set_data("searchatlas.keyword.id", keyword_id)
    ...
```

NEVER (no OTel layer in this project):
```python
from opentelemetry import trace                                   # forbidden here
from opentelemetry.instrumentation.django import DjangoInstrumentor  # forbidden here
```

Sentry is the backend AND the API. Adding OpenTelemetry on top of Sentry just doubles the conceptual surface without buying portability — the project does not need backend swap-out.

## 2. Auto-instrumentation via Sentry integrations

Sentry's integrations wrap the underlying library transparently. Enable them in `sentry_sdk.init(...)`:

| Integration | What it captures |
|---|---|
| `sentry_sdk.integrations.django.DjangoIntegration` | Views, middleware, ORM, request data |
| `sentry_sdk.integrations.celery.CeleryIntegration` | Task dispatch + execution + retries |
| `sentry_sdk.integrations.redis.RedisIntegration` | Redis ops (broker + cache) |
| `sentry_sdk.integrations.httpx.HttpxIntegration` | Outbound HTTP via `httpx` |
| `sentry_sdk.integrations.stdlib.StdlibIntegration` (auto) | `urllib`, `subprocess`, etc. |

`requests` is auto-instrumented via `StdlibIntegration` (it uses `urllib3`). Psycopg auto-instrumentation comes from `DjangoIntegration` (Django wraps the cursor).

DO NOT install `opentelemetry-instrumentation-*` packages. They're redundant here and create double-spans.

Manual spans go in `<app>/services/` for **business operations** that span multiple I/O calls:

```python
# crawls/services/start_crawl.py
import sentry_sdk
from django.db import transaction

def start_crawl(*, site_id: int, user, region: str = "us") -> int:
    with sentry_sdk.start_span(op="crawl.start", description=f"site={site_id}") as span:
        span.set_data("searchatlas.site.id", site_id)
        span.set_data("searchatlas.crawl.region", region)
        crawl = Crawl.objects.create(site_id=site_id, region=region)
        transaction.on_commit(lambda: dispatch_crawl.delay(crawl.id))
        span.set_data("searchatlas.crawl.id", crawl.id)
        return crawl.id
```

DON'T wrap auto-instrumented calls — Django views, ORM queries, outbound HTTP already produce spans. Wrapping them creates duplicate spans and confuses parent-child relationships.

## 3. Bootstrap pattern (`config/sentry.py`)

One init module, called from BOTH `manage.py` (before `execute_from_command_line`) and `config/celery.py` (after `app = Celery(...)`).

```python
# config/sentry.py
import os
import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration
from sentry_sdk.integrations.celery import CeleryIntegration
from sentry_sdk.integrations.redis import RedisIntegration

_initialized = False


def init_sentry(service_name: str) -> None:
    """Call once per process (web, worker, beat). Idempotent."""
    global _initialized
    if _initialized:
        return

    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        _initialized = True  # explicit no-op so callers don't retry
        return

    env = os.environ.get("SENTRY_ENVIRONMENT", "local")
    sentry_sdk.init(
        dsn=dsn,
        environment=env,
        release=os.environ.get("SENTRY_RELEASE"),  # set by CI
        integrations=[
            DjangoIntegration(
                cache_spans=True,
                signals_spans=False,  # too noisy
            ),
            CeleryIntegration(monitor_beat_tasks=True),
            RedisIntegration(),
        ],
        traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        profiles_sample_rate=float(os.environ.get("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
        send_default_pii=False,
        attach_stacktrace=False,
    )
    sentry_sdk.set_tag("service", service_name)
    _initialized = True
```

Call sites:

```python
# manage.py — before execute_from_command_line
from config.sentry import init_sentry
init_sentry("searchatlas-backend")
```

```python
# config/celery.py — after app = Celery(...)
from config.sentry import init_sentry
init_sentry("searchatlas-celery")
```

Pass distinct `service_name` per process so Sentry's UI separates web vs worker. For full quota separation, use **separate Sentry projects** with **separate DSNs** (see §10).

## 4. Span naming + tags/data conventions

Sentry has two metadata namespaces on spans:

- **`op`** — span operation name. Short, lowercase, dotted. This is the equivalent of OTel's span name.
- **`description`** — free-form short string, may include an identifier (e.g. `keyword=42`).
- **`set_data(key, value)`** — span-scoped key/value pairs (queryable in Sentry).
- **`set_tag(key, value)`** — event-scoped tag (cross-cuts the whole transaction).

**Names** — `<domain>.<verb>` lowercase:
```
crawl.fetch_serp
crawl.start
report.generate
serp.parse
keyword.bulk_import
```

**Three attribute namespaces:**

| Where | Examples |
|---|---|
| Sentry standard `http.*`, `db.*` (auto-set by integrations) | `http.method`, `db.system` |
| Custom domain data: `searchatlas.<context>.<field>` | `searchatlas.crawl.id`, `searchatlas.site.id` |
| Tags (cross-event): set at init or per-transaction | `service`, `feature_flag.x` |

```python
span.set_data("searchatlas.crawl.id", crawl_id)
span.set_data("searchatlas.crawl.region", region)
sentry_sdk.set_tag("service", "searchatlas-celery")  # once at init
```

Bounded contexts come from [searchatlas-domain](../searchatlas-domain/SKILL.md) — `accounts`, `sites`, `keywords`, `crawls`, `serps`, `reports`, `webhooks`. Use those exact names in the namespace.

## 5. Context propagation across boundaries

Distributed tracing only works if context crosses every boundary. SearchAtlas has four:

**HTTP (incoming)** — `DjangoIntegration` extracts Sentry's `sentry-trace` and `baggage` headers from incoming requests. No code needed.

**HTTP (outgoing)** — `HttpxIntegration` / `StdlibIntegration` automatically inject `sentry-trace` headers into outbound requests so downstream services continue the trace.

**Celery** — `CeleryIntegration` propagates trace context via task headers. Combined with `transaction.on_commit` (see [django-celery-patterns §1](../django-celery-patterns/SKILL.md)):

```python
# RIGHT — context propagates AND task fires after commit
def start_crawl(site_id: int) -> int:
    with sentry_sdk.start_span(op="crawl.start"):
        crawl = Crawl.objects.create(site_id=site_id)
        transaction.on_commit(lambda: fetch_serp.delay(crawl.id))
        return crawl.id
```

The trace `crawl.start → fetch_serp` shows the parent-child chain even though one ran in the web process and the other in a Celery worker.

**DB** — `DjangoIntegration` captures slow queries as spans of `op="db"`. No sqlcommenter equivalent in pure Sentry — if you need to correlate slow queries (from Postgres logs) back to a Sentry transaction, search by `transaction_id` in the Sentry UI using the timestamp from Postgres `log_min_duration_statement`.

## 6. Status, exceptions, and PII

Sentry auto-captures unhandled exceptions. For **caught** exceptions you want recorded without re-raising:

```python
import sentry_sdk

with sentry_sdk.start_span(op="crawl.fetch_serp") as span:
    try:
        result = fetch(url)
    except requests.RequestException as exc:
        sentry_sdk.capture_exception(exc)  # records on the current transaction
        span.set_status("internal_error")
        raise
```

`capture_exception` attaches the exception to the active transaction. The span's `set_status` adds the visual ERROR indicator in the Sentry trace view.

**Never put PII in span data, tags, or breadcrumbs.** These are queryable across the whole project. WRONG:

```python
span.set_data("user.email", user.email)              # PII
span.set_data("request.body", request.body)          # may contain PII + huge
sentry_sdk.set_tag("auth", request.headers["Authorization"])  # secret
```

RIGHT:

```python
span.set_data("searchatlas.user.id", user.id)        # ID only
span.set_data("searchatlas.payload.size", len(request.body))
# don't set the auth header at all
```

`sentry_sdk.init(send_default_pii=False)` is the project default — keep it. It prevents Sentry from auto-scraping cookies, request bodies, and user identifiers from the request scope.

## 7. Cardinality discipline

Spans and tags are indexed. High-cardinality values explode storage cost and make the UI slow. Rule: a tag/data key should have **dozens to thousands** of distinct values across all events, not millions.

| WRONG | RIGHT |
|---|---|
| `set_data("http.url", "/users/42?token=abc")` | `set_data("http.route", "/users/{id}")` + `set_data("searchatlas.user.id", 42)` |
| `set_data("query", "SELECT * FROM crawls WHERE id=42")` | let `DjangoIntegration` set sanitized `db.statement` |
| `set_data("search_query", user_typed_text)` | `set_data("searchatlas.search.length", 23)` |
| `set_data("payload", dict_repr)` | `set_data("searchatlas.payload.kind", "crawl_request")` |

Span `op` is also indexed — never put IDs in `op`: WRONG `op="crawl.fetch_serp.42"`, RIGHT `op="crawl.fetch_serp"` + `set_data("searchatlas.crawl.id", 42)`. The `description` field is the right place for an inline identifier.

**Tags** specifically have a strict cardinality ceiling in Sentry (a few hundred values per tag key) before queries get throttled. Reserve tags for low-cardinality dimensions (`service`, `environment`, `feature_flag`, `region`). Use span `data` for IDs.

## 8. Sampling strategy

One layer only — Sentry's `traces_sample_rate` in `sentry_sdk.init(...)`. Default sane values:

| Env | `SENTRY_TRACES_SAMPLE_RATE` |
|---|---|
| local | `1.0` (everything — but watch the free-tier quota; lower if dev sessions burn through it) |
| staging | `0.5` |
| prod | `0.05`–`0.1` |

For dynamic sampling (e.g. always-sample a specific route), use `traces_sampler` callable instead of a static rate:

```python
def _sampler(ctx):
    op = ctx.get("transaction_context", {}).get("op", "")
    if op == "http.server" and ctx.get("transaction_context", {}).get("name", "").startswith("/admin"):
        return 0.0  # never sample admin
    if op.startswith("celery"):
        return 0.5
    return 0.1

sentry_sdk.init(..., traces_sampler=_sampler)
```

Sentry auto-keeps error transactions regardless of sample rate — a 500 with a captured exception is always sent. Don't worry about errors being silenced by sampling.

**NEVER sample inside business code:**

```python
# WRONG — sampling decision in service code
if random.random() < 0.1:
    with sentry_sdk.start_span(op="crawl.start"):
        ...
```

The sampler is a single concern at SDK init. Smearing it across the codebase makes it impossible to reason about what's traced.

## 9. Backend choice — Sentry SaaS, period

**This project does not run a tracing collector or alternate backend.** No Jaeger, no Tempo, no Honeycomb, no OTel Collector. Sentry SaaS holds both errors and traces.

Reasons this decision is locked in:
- Free tier covers small projects (~5k errors + ~10k spans/month).
- Errors and traces in one tool → one query language, one alerting model, one ACL.
- No collector means no extra container and no PII-filter config to maintain.
- The team is one person; portability across vendors is not a real requirement.

If a different backend ever needs to be added (Honeycomb, Datadog, etc.), the right move is **not** "add OpenTelemetry on top." It's "evaluate whether Sentry still fits, and if not, replace the sentry-sdk init module." Trying to fan-out to two backends from one SDK is the abstraction Sentry users do not need.

## 10. Common pitfalls

- **Importing `from opentelemetry import trace`** — forbidden in this project. Use `sentry_sdk` directly. If you find this in a diff, treat as a regression.
- **Installing `opentelemetry-instrumentation-*`** — same. The Sentry integrations cover the same surface.
- **Manual span around an auto-instrumented call** — wrapping `requests.get(...)` or a Django view body in your own span creates two parent-child spans showing the same operation. Trust the integrations.
- **Sampling inside business code** — see §8. Centralize at SDK init.
- **PII / cardinality in span data or tags** — see §6 and §7.
- **`time.sleep` inside a span** — counts as span duration, makes flame graphs lie. If you must sleep, do it outside the span context.
- **Forgetting `init_sentry()` in the Celery worker** — `manage.py` calls it but the worker process is separate. Call from `config/celery.py` too or worker errors and traces are silently dropped.
- **Empty `SENTRY_DSN`** — `init_sentry` becomes a no-op (intentional). Nothing's broken; nothing's exported. If your traces "disappeared", check the DSN first.
- **Two services, one DSN** — backend Django and Celery worker should use **separate Sentry projects** (different DSNs) so quotas, alerts, and ownership don't smear. The `service` tag is a label, not a routing key.
- **`set_tag` for high-cardinality values** — tags have a strict ceiling. IDs go in `set_data`, never `set_tag`.
- **Logs vs traces** — this skill is tracing-only. For logs, structured logging with `sentry_sdk.add_breadcrumb(...)` for narrative context plus standard Python logging is the right pattern.
