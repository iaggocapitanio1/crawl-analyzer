---
name: django-versions
description: Apply when discussing Django versions, choosing what to upgrade to, editing the django pin in pyproject.toml, or referencing version-specific Django features. Training data on Django releases is stale — fetch the docs before claiming a feature exists.
---

# Django — version landscape (verified 2026-05-10)

## Rule zero: don't guess versions, fetch the docs

Claude's training cutoff (Jan 2026) predates Django 6.0's release window (Dec 2025) and misses everything after. **Before** claiming a feature exists, a version is current, or a deprecation has landed:

- Releases page: https://www.djangoproject.com/download/
- Release notes index: https://docs.djangoproject.com/en/dev/releases/
- Per-version notes: `https://docs.djangoproject.com/en/<X.Y>/releases/<X.Y>/`

Use `WebFetch` against those URLs — do not rely on memory for "what landed in 6.0" or "is 6.x out yet". The version landscape moves twice a year.

## Current landscape (2026-05-10)

| Version | Status | Mainstream ends | Extended/LTS ends |
|---|---|---|---|
| **6.0.5** | Latest stable | Aug 2026 | Apr 2027 |
| **5.2 LTS** (5.2.14) | **Current LTS — what this project uses** | Dec 2025 (over) | **Apr 2028** |
| 6.1 | Future | Aug 2026 | Apr 2027 |
| **6.2 LTS** | Future | Apr 2027 | Apr 2030 |

5.1, 5.0, 4.2 LTS and earlier are EOL — do not suggest them.

## What this project pins

`backend/pyproject.toml`: `django>=5.2,<5.3`. The choice is deliberate — LTS gives security patches until **April 2028**. Don't propose bumping to 6.0 unless the user explicitly asks. If they do, the upgrade is non-trivial (see §"5.2 → 6.0 highlights" below).

## Common mistakes from stale training

- "Django 6.2" — **does not exist yet** (Apr 2027). The user may say it; correct gently and confirm 5.2 LTS is intended.
- "The latest Django is 5.2" — **wrong**, 6.0 is the latest *stable*; 5.2 is the latest *LTS*. They are different things.
- Suggesting Python 3.10 or 3.11 — Django 6.0 dropped them; only 3.12/3.13/3.14. (5.2 still supports 3.10+.)
- Claiming `BackgroundTasks` framework is "coming soon" — it shipped in 6.0.
- Claiming CSP middleware needs `django-csp` package — built-in since 6.0.

## 5.2 → 6.0 highlights (if upgrade is ever requested)

These are the items most likely to bite a real codebase. Always re-read the official notes before doing the upgrade — this list is a teaser, not a substitute.

**Backwards-incompatible**
- Drops Python <3.12. Project is already on 3.12, OK.
- `DEFAULT_AUTO_FIELD` default changed from `AutoField` → `BigAutoField`. Existing projects must explicitly set `DEFAULT_AUTO_FIELD = 'django.db.models.AutoField'` if they relied on the old default. New SearchAtlas apps should keep `BigAutoField`.
- Custom ORM expressions: `as_sql()` must return params as a `tuple`, not `list`.
- `psycopg` minimum 3.1.12; `asgiref` minimum 3.9.1; `Pillow` 10.1.0+.
- `Field.pre_save()` may be called multiple times — must be idempotent.
- DB schema editor no longer uses `CASCADE` when dropping columns.

**New features worth knowing about**
- **CSP middleware built-in** (`SECURE_CSP`, `SECURE_CSP_REPORT_ONLY`, `ContentSecurityPolicyMiddleware`).
- **Template partials** (`{% partialdef %}` / `{% partial %}`).
- **Background Tasks framework** (`@task()` decorator + `TASKS` setting). Note: this overlaps with Celery — for SearchAtlas, **stick with Celery** (it's already wired, supports retries/queues/beat the way the domain expects). The new framework is intentionally simpler.
- `StringAgg` and `AnyValue` aggregates now cross-database (no longer Postgres-only).
- `AsyncPaginator` / `AsyncPage` for async pagination.
- Modern email API (`email.message.EmailMessage` instead of `SafeMIMEText`).
- PBKDF2 iteration count bumped 1M → 1.2M (rehash on next login).

**Deprecations that fire warnings**
- `URLIZE_ASSUME_HTTPS` setting (HTTPS becomes default in 7.0).
- `ADMINS`/`MANAGERS` as tuples — switch to `'"Name" <address>'` strings.
- Positional args to email functions — keyword-only.
- PostgreSQL-specific `StringAgg` (use cross-DB version).

**Removed (end of deprecation cycle)**
- `cx_Oracle` (use python-oracledb).
- `Model.save()` positional args (keyword-only except the first four).
- `Prefetch.get_current_queryset()` and `get_prefetch_queryset()`.
- Various `ForeignObject` / form renderer leftovers.

## Workflow when a version question comes up

1. If the user names a version, **verify it exists** — check the downloads page if uncertain.
2. If they ask "is X feature available", fetch the release notes for the project's pinned version (5.2) and confirm. Do not guess from training data.
3. If they want to upgrade, propose reading the relevant `releases/X.Y/` page first, then plan the upgrade as a separate change — never bundle a Django version bump with feature work.
