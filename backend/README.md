# Backend

Django + DRF + Celery backend for the SearchAtlas Crawl Analyzer.

## Stack

- Python 3.9, Django 4.2, Django REST Framework 3.14
- Celery 5.3 with Redis 6 as broker + result backend
- PostgreSQL 13
- `django-filter`, `django-cors-headers`, `tldextract`

## Running

From the repository root: `make setup` (first time) or `make start-backend`. Equivalent raw commands from this directory:

```sh
docker compose build
docker compose up -d
docker compose logs -f web celery   # tail logs
docker compose down                 # stop
```

The `web` container runs migrations on start, so the DB is fully seeded by the time the API is reachable at [http://localhost:8000/api/](http://localhost:8000/api/).

## Seeded data

`crawl/migrations/0002_seed_data.py` populates the database from a pre-processed slice of [Common Crawl](https://commoncrawl.org/) data:

- 3 domains (`acmewidgets.com`, `globaltech.io`, `sampleshop.net`)
- ~130 pages
- ~4,000 outbound links

Each domain is in a different enrichment-freshness state (recently refreshed, stale, never scored), so the read API returns a realistic mix on day one.

The raw WAT file lives at [data/sample.wat.gz](data/sample.wat.gz) for reference, but it is not parsed at runtime — the migration is the only ingestion path in the shipped app.

## App layout

```
backend/
├── crawler/                 # Django project package
│   ├── settings.py
│   ├── urls.py
│   ├── celery.py
│   ├── wsgi.py / asgi.py
├── crawl/                   # crawl-analytics app
│   ├── models.py            # Domain, Page, PageLink, StatsSnapshot, ExportJob
│   ├── providers.py         # external SEO data providers (stubbed)
│   ├── serializers.py
│   ├── views.py             # DRF viewsets + custom actions
│   ├── urls.py
│   ├── tasks.py             # Celery tasks
│   ├── filters.py
│   ├── pagination.py
│   ├── admin.py
│   └── migrations/
│       ├── 0001_initial.py
│       └── 0002_seed_data.py
├── data/sample.wat.gz
├── docker-compose.yml
├── Dockerfile
├── manage.py
└── requirements.txt
```

## Top-level endpoints

- `GET  /api/domains/` · `GET /api/domains/{id}/`
- `GET  /api/domains/{id}/insights/` · `GET /api/domains/{id}/backlinks/`
- `GET  /api/pages/` · `GET /api/pages/{id}/`
- `GET  /api/pages/{id}/seo-score/`
- `GET  /api/exports/` · `POST /api/exports/` · `GET /api/exports/{id}/download/`
- `GET  /api/stats/`

`django-filter` is wired up for the page list; see `crawl/filters.py` for available query params.
