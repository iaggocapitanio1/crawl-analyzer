---
name: python-deps-uv
description: Apply when adding, removing, upgrading, or locking Python dependencies in the backend, or when editing pyproject.toml / uv.lock / Dockerfile dep layers. This project uses uv + pyproject.toml — never requirements.txt.
---

# Python deps — uv + pyproject.toml

## Rule zero: never use requirements.txt

This project uses [uv](https://docs.astral.sh/uv/) with `pyproject.toml` and a committed `uv.lock`. If you see a `requirements.txt` being added or referenced, that is a regression — push back and convert to `pyproject.toml`.

Why: `uv` resolves and installs 10–100× faster than pip, the lockfile is reproducible across machines and CI, and `pyproject.toml` is the [PEP 621](https://peps.python.org/pep-0621/) standard.

## Layout

`backend/pyproject.toml`:

```toml
[project]
name = "searchatlas-backend"
version = "0.1.0"
requires-python = ">=3.12,<3.13"
dependencies = [
    "django>=5.2,<5.3",
    "djangorestframework>=3.15,<4.0",
    "celery>=5.4,<6.0",
    "redis>=5.0,<6.0",
    "psycopg[binary]>=3.2,<4.0",
    "flower>=2.0,<3.0",
    "sentry-sdk[django,celery]>=2.18,<3.0",
    "django-environ>=0.11,<1.0",
]

[dependency-groups]
dev = [
    "ruff>=0.7",
    "pytest>=8.3",
    "pytest-django>=4.9",
    "pytest-cov>=5.0",
]

[tool.uv]
package = false  # backend is an app, not a publishable library
```

Pin `requires-python` to a single minor (e.g. `>=3.12,<3.13`) so the resolver picks one set of wheels — avoids "works on my 3.13, breaks on 3.12 CI" drift.

`backend/uv.lock` — **always commit it**. It is the single source of truth for reproducible builds.

## Commands cheatsheet

| Action | Command |
|---|---|
| Install + create venv | `uv sync` |
| Install with dev deps | `uv sync --group dev` |
| Add a runtime dep | `uv add django-filter` |
| Add a dev-only dep | `uv add --group dev pytest-mock` |
| Remove a dep | `uv remove django-filter` |
| Upgrade one dep | `uv lock --upgrade-package django` |
| Upgrade all | `uv lock --upgrade` |
| Run a command in env | `uv run python manage.py migrate` |
| Run pytest | `uv run pytest` |

After any `uv add` / `uv remove` / `uv lock` — commit both `pyproject.toml` AND `uv.lock` in the same commit.

## Docker

Use uv's official image stage to keep the build fast and the runtime lean:

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/usr/local

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Layer 1: deps only (cached unless lock changes)
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project --no-dev

# Layer 2: project code
COPY . .
```

Rules:
- `--locked` fails the build if `uv.lock` is out of sync with `pyproject.toml`. Always use it in CI/Docker — never `uv sync` without `--locked` in a build.
- `--no-dev` in production images. Dev group only in CI test images.
- `UV_PROJECT_ENVIRONMENT=/usr/local` installs into the system Python — no nested venv inside the container.
- Copy `pyproject.toml` + `uv.lock` BEFORE the rest of the code so the deps layer caches.

## Local dev workflow

```powershell
# First time
cd backend
uv sync --group dev

# Activate (optional — `uv run` doesn't need it)
.\.venv\Scripts\Activate.ps1

# Or just run things directly
uv run python manage.py runserver
uv run pytest
```

`uv sync` creates `backend/.venv/` automatically — already covered by [.gitignore](../../.gitignore).

## Pitfalls

- **Mixing `pip install` with `uv sync`**: don't. `pip install` writes to the venv but doesn't update `uv.lock`, so the next `uv sync` will silently revert it. Always use `uv add`.
- **Forgetting to commit `uv.lock`**: CI builds will then resolve fresh and may pick newer versions than what you tested. Treat lock omission as a bug.
- **Editable installs of the project itself**: with `package = false` (above), uv won't try to install `searchatlas-backend` as a package. Don't fight this — the Django app is run via `manage.py`, not as an installed package.
- **`uv pip` vs `uv`**: `uv pip` is a pip-compatibility shim for one-off installs into an arbitrary venv. For project work always use `uv add` / `uv sync` / `uv run`, not `uv pip install`.
- **CI cache**: cache `~/.cache/uv` (Linux) or `%LOCALAPPDATA%\uv\cache` (Windows). Far bigger speed-up than caching the venv itself.
