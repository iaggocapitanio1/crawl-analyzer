# SearchAtlas Crawl Analyzer

Starter repository for the SearchAtlas full-stack engineering assessment. The application is a small slice of our internal crawl-analytics platform: domain-level insights, page metadata, backlink counts, and filtered CSV exports, backed by a real slice of Common Crawl data.

This repo is the **environment you'll work in during the interview**. The specific assessment tasks are delivered separately in a Google Doc at the start of your session — do not worry about figuring them out ahead of time.

## Before the interview

1. Clone this repo.
2. **Fork it to your preferred version control platform** (GitHub, GitLab, Bitbucket — whichever you normally use). Make sure the fork is somewhere you can push to during the session.
3. Run `make setup` on your laptop and confirm the stack boots (see below).
4. Open the app at [http://localhost:3000](http://localhost:3000) and poke around — you should see domains, pages, and a dashboard. All of this is pre-seeded.

## What you'll need

- **Docker** and **Docker Compose** (the backend and its Postgres/Redis dependencies run in containers).
- **Node.js 20+** (the frontend runs as a local `next dev` server).
- **An AI coding assistant you're already comfortable with** — Cursor, Claude Code, Copilot, whatever you like. You'll use it during the interview.

## Setup

From the repository root:

```sh
make setup
```

This runs `docker compose build` + `docker compose up -d` in `backend/`, and `npm install` + `npm run dev` in `frontend/`. The first run pulls images and seeds the database with ~130 pages across three domains.

Useful targets:

- `make start` / `make stop` / `make restart` — control both services.
- `make start-backend` / `make start-frontend` — control one.
- Backend logs: `cd backend && docker compose logs -f web celery`
- Frontend logs: `temp/frontend.log` at the repo root.

URLs once running:

- Frontend: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:8000/api/](http://localhost:8000/api/)
- Django admin: [http://localhost:8000/admin/](http://localhost:8000/admin/) (no superuser seeded; create one with `docker compose exec web python manage.py createsuperuser` if needed).

## Tech stack

- **Backend**: Python 3.9 · Django 4.2 · Django REST Framework · Celery · PostgreSQL 13 · Redis 6.
- **Frontend**: Next.js 15 (Pages Router) · React 18 · TypeScript · TailwindCSS · SWR.
- **Infrastructure**: Docker Compose for the backend; `npm run dev` for the frontend.

## Repo layout

```
full-stack-assessment/
├── Makefile                     # setup/start/stop for the full stack
├── backend/                     # Django project
│   ├── crawler/                 # project package: settings, urls, celery
│   ├── crawl/                   # the crawl-analytics app
│   ├── data/sample.wat.gz       # Common Crawl WAT (reference only; seeded via migration)
│   ├── docker-compose.yml
│   └── Dockerfile
└── frontend/                    # Next.js project
    ├── src/
    │   ├── pages/               # Dashboard, Domains, Pages, Exports
    │   ├── components/
    │   ├── hooks/
    │   ├── lib/                 # API client
    │   └── types/
    └── package.json
```

## During the interview

- Your interviewer is **not a technical person** and can't help with setup, the stack, or the tasks. If anything in the environment isn't working, use your AI assistant. If you get stuck on a task, use your AI assistant and your own judgment — don't ask the interviewer for hints.
- You'll receive the task description in a Google Doc at session start. You have 75 minutes total to work on it.
- When time is up, commit and push your work to your fork, and paste the fork URL in the chat with your interviewer. **Submissions after the session ends are not accepted** — the grading pipeline ignores any commits made after your time window.
