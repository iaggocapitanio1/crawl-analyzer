# Frontend

Next.js + React + TypeScript + Tailwind dashboard for the SearchAtlas Crawl Analyzer.

## Stack

- Next.js 15 (Pages Router)
- React 18, TypeScript 5
- TailwindCSS 3
- SWR for data fetching + polling

## Running

From the repository root: `make setup` (first time) or `make start-frontend`. Equivalent raw commands from this directory:

```sh
npm install
npm run dev
```

App lives at [http://localhost:3000](http://localhost:3000).

The frontend talks to the Django backend directly. `NEXT_PUBLIC_API_URL` in [.env](.env) points at `http://localhost:8000` by default — change it if you're running the API somewhere else.

## Pages

| Route               | Purpose                                        |
|---------------------|------------------------------------------------|
| `/`                 | Dashboard: KPIs + Backlink Overview widget     |
| `/domains`          | Domain list                                    |
| `/domains/[id]`     | Domain detail with the Insights panel          |
| `/pages`            | Filterable pages table + CSV export button     |
| `/pages/[id]`       | Page detail with the SEO Score panel           |
| `/exports`          | Past export jobs                               |

## Layout

```
frontend/src/
├── components/
│   ├── Layout.tsx
│   └── DataTable.tsx
├── hooks/
│   └── usePolling.ts
├── lib/
│   └── api.ts           # fetch wrapper with base URL + error normalization
├── pages/
│   ├── _app.tsx
│   ├── _document.tsx
│   ├── index.tsx        # dashboard
│   ├── domains/
│   ├── pages/
│   └── exports/
├── state/               # (empty; add app state here if you need it)
├── styles/
│   └── globals.css
├── types/
│   └── api.ts           # TS mirrors of DRF serializers
└── utils/
    └── config.ts
```

## Notes

- All API calls go through `apiFetch` (or the SWR `swrFetcher` wrapped around it). It normalizes error bodies into a thrown `ApiError`.
- `usePolling` is a convenience for repeated fetches with cleanup on unmount.
- No client-side auth — the backend currently has `AllowAny` permissions.
