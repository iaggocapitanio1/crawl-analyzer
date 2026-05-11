---
name: nextjs-app-router
description: Apply when working with Next.js App Router — Server Components, Client Components, layouts, route groups, rendering strategies. Targets Next 15+.
---

# Next.js App Router patterns (Next 15+)

## ALWAYS read the bundled docs first

For any non-trivial App Router task, read `frontend/node_modules/next/dist/docs/01-app/` — the docs are version-matched to the installed Next.js. Your training data is months stale.

## 1. Server Components by default

Every component is a Server Component unless you opt out with `'use client'` at the top of the file.

**Server Components:**
- Render on server, ship zero JS
- Can `await` directly: `const data = await fetch(...)`
- Can access env vars, DB, secrets
- CANNOT use `useState`, `useEffect`, event handlers, browser APIs

**Client Components (`'use client'`):**
- Use hooks and event handlers
- Cannot `await` at the top level (use Suspense + a child Server Component for that)
- Run on server (initial render) AND client (hydration + interactivity)
- All children become Client Components UNLESS passed via the `children` prop

## 2. Push 'use client' as deep as possible

```tsx
// WRONG — whole tree is client
'use client'
export default function Page() {
  return <div><Header /><FilterBar /><DataTable /></div>
}

// RIGHT — only FilterBar is client
// page.tsx (Server)
export default function Page() {
  return <div><Header /><FilterBar /><DataTable /></div>
}

// filter-bar.tsx (Client)
'use client'
export function FilterBar() { ... }
```

## 3. Pass server data to client via props

```tsx
// page.tsx (Server)
export default async function Page() {
  const sites = await db.site.findMany({ where: { ownerId: userId } })
  return <SiteTable sites={sites} />
}

// site-table.tsx (Client)
'use client'
import { useState } from 'react'
export function SiteTable({ sites }: { sites: Site[] }) {
  const [filter, setFilter] = useState('')
  ...
}
```

The "children prop" pattern lets a Client Component wrap Server Component children:
```tsx
'use client'
export function ClientProvider({ children }) {
  return <Context.Provider value={...}>{children}</Context.Provider>
}

// usage in a Server Component:
<ClientProvider>
  <ServerComponent />  {/* still server — passed as children */}
</ClientProvider>
```

## 4. Rendering strategies (per route)

| Need | Code in `page.tsx` |
|---|---|
| Static at build time | (default — no dynamic functions used) |
| Static + revalidate every N seconds (ISR) | `export const revalidate = 60` |
| Force SSR every request | `export const dynamic = 'force-dynamic'` |
| Force fully static (error if dynamic used) | `export const dynamic = 'force-static'` |
| PPR (partial prerender) | `export const experimental_ppr = true` |

Using `cookies()`, `headers()`, or `searchParams` opts the route into dynamic rendering automatically.

## 5. File conventions

```
app/
  layout.tsx          // root layout (required)
  page.tsx            // route component
  loading.tsx         // suspense boundary fallback
  error.tsx           // error boundary (must be Client Component)
  not-found.tsx       // shown by notFound() or 404
  template.tsx        // re-mounts on nav (rare — for entry/exit anim)
  default.tsx         // parallel route fallback
```

- **Layout** persists across navigation, doesn't re-render its server tree on child nav.
- **Template** re-mounts on every navigation — only use for animation.

## 6. Route groups and parallel routes

Route groups: `(name)/` — organize without affecting URL. Common pattern:
```
app/
  (marketing)/
    layout.tsx     // public-facing layout
    page.tsx       // /
    pricing/
  (app)/
    layout.tsx     // logged-in layout, auth check here
    sites/
    keywords/
```

Both `(marketing)` and `(app)` map to `/` URL space — group is invisible.

Parallel routes: `@slot/` — render multiple pages in the same layout:
```
app/
  layout.tsx       // renders {children} {analytics} {team}
  @analytics/page.tsx
  @team/page.tsx
  page.tsx
```

Useful for dashboards. Don't over-use.

## 7. Streaming with Suspense

Slow data? Wrap in Suspense to stream:

```tsx
export default function Page() {
  return (
    <>
      <FastSection />
      <Suspense fallback={<Skeleton />}>
        <SlowChart />  {/* awaits internally */}
      </Suspense>
    </>
  )
}

async function SlowChart() {
  const data = await slowFetch()
  return <Chart data={data} />
}
```

User sees `FastSection` immediately. `SlowChart` streams in when ready.

## 8. Common traps

- `'use client'` in `layout.tsx` — turns the whole subtree client-side. Almost always wrong.
- Importing a server-only library (e.g., `pg`, `prisma/client`) into a Client Component — build break. Use `import 'server-only'` to enforce at build time.
- Forgetting that `page.tsx` Server Components can't use hooks. Move state to a Client child.
- `metadata` export in a Client Component — doesn't work. Metadata must be in a Server Component or static.
- Forgetting `error.tsx` must be `'use client'` — error boundaries are client-side React.
