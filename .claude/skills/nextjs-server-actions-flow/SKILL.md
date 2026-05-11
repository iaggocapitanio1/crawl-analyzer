---
name: nextjs-server-actions-flow
description: Apply when working with Server Actions, mutations, or client-side state in Next.js 16+. Reminds that middleware was renamed to proxy, that reads belong on the server (Server Components + fetch + Suspense + React.use), that legitimate client-side fetching uses TanStack Query, and the canonical useActionState + useEffect mutation flow. Catches the very common useTransition(async () => await action()) anti-pattern — the response comes from useActionState, not from awaiting inside a transition.
---

# Next.js — Server Actions, mutation flow, and client state (Next 16+)

## Rule zero: read the docs, your training is stale

Next.js released breaking changes in 16.0 (May 2026). Before writing anything non-trivial, fetch the relevant page from `nextjs.org/docs/app/...` (or read `frontend/node_modules/next/dist/docs/` once the project is initialized). Specifically:

- [Fetching Data](https://nextjs.org/docs/app/getting-started/fetching-data)
- [Forms with Server Actions](https://nextjs.org/docs/app/guides/forms)
- [proxy.js (file convention)](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- [Caching](https://nextjs.org/docs/app/getting-started/caching)

If the question is "does feature X exist", do not guess — fetch.

## 1. `middleware.ts` is deprecated → use `proxy.ts`

Renamed in Next 16.0. The file convention, the function name, and the type are all renamed:

```ts
// proxy.ts — at the project root (or src/ if applicable)
import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // auth, redirects, header rewriting, etc.
  return NextResponse.next()
}

export const config = { matcher: '/dashboard/:path*' }
```

Codemod for an existing project: `npx @next/codemod@canary middleware-to-proxy .`

**CRITICAL security note from the docs**: a `proxy` matcher that excludes a path also skips Server Action calls on that path, and a refactor that moves a Server Action to a different route can silently remove proxy coverage. **Always verify auth inside each Server Action**, never rely solely on proxy. (The old `nextjs-data-fetching` skill already says this — Next 16 makes the warning even sharper because of the rename.)

Other Next 16 differences from older docs:
- Default runtime is **Node.js** (was Edge). The `runtime` config option is **not available** in proxy — setting it throws.
- The function can be the default export OR named `proxy`. Multiple proxies per file are not supported.

## 2. Server-first for reads (don't fetch in client when the server can)

Default for any data read: an `async` Server Component using `fetch` or an ORM. Zero client JS, deduped, streamable.

```tsx
// app/sites/page.tsx — Server Component (no 'use client')
export default async function SitesPage() {
  const sites = await fetch('https://api.searchatlas.com/sites', {
    next: { revalidate: 60 },
  }).then(r => r.json())
  return <SiteList sites={sites} />
}
```

Only consider client-side fetching when:
- Data depends on client-only state (search-as-you-type, filters bound to URL state the user is mutating)
- Real-time push (WebSocket, SSE)
- Infinite scroll where streaming `<Suspense>` doesn't fit

When that bar is met → use **TanStack Query** (§7), not `useEffect(() => fetch(...))`.

## 3. Streaming uncached data with `<Suspense>` and `React.use`

Don't await an expensive promise at the page top — that blocks the whole route. Pass it down and stream in:

```tsx
// app/blog/page.tsx — Server
import { Suspense } from 'react'
import Posts from './posts'

export default function Page() {
  const posts = getPosts()  // do NOT await
  return (
    <Suspense fallback={<PostsSkeleton />}>
      <Posts posts={posts} />
    </Suspense>
  )
}
```

```tsx
// app/blog/posts.tsx — Client
'use client'
import { use } from 'react'

export default function Posts({ posts }: { posts: Promise<Post[]> }) {
  const list = use(posts)               // unwraps the promise; suspends until ready
  return <ul>{list.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}
```

`React.use(promise)` is how a Client Component reads a promise streamed from the server. It integrates with `<Suspense>` — no `useEffect`, no loading flag, no `useState`.

## 4. Mutations = Server Actions (default)

```tsx
// app/sites/actions.ts
'use server'
import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { auth } from '@/lib/auth'

const schema = z.object({ domain: z.string().url() })

// signature when used with useActionState: (prevState, formData) => newState
export async function createSite(_prev: State, formData: FormData): Promise<State> {
  const session = await auth()
  if (!session?.user) return { ok: false, message: 'unauthorized' }

  const parsed = schema.safeParse({ domain: formData.get('domain') })
  if (!parsed.success) return { ok: false, message: 'Invalid domain' }

  const site = await db.site.create({ data: { ...parsed.data, ownerId: session.user.id } })
  revalidateTag('sites')
  return { ok: true, message: 'Site created', siteId: site.id }
}

type State = { ok: boolean; message: string; siteId?: string }
```

Auth check **inside** the action. Validate input — actions are HTTP endpoints. `revalidateTag` / `revalidatePath` to refresh affected Server Components.

## 5. Client mutation flow — the canonical pattern

The hooks involved have well-defined roles. Mixing them up creates the most common bug in Next 16 apps.

| Hook | Purpose |
|---|---|
| `useActionState(action, initial)` | Returns `[state, formAction, pending]`. `state` is the action's **return value**. `formAction` is what you pass to `<form action={...}>`. `pending` is true while running. |
| `useFormStatus()` | Inside a `<form>`, returns `{ pending }` for the enclosing form. Use in a separate component (e.g. `<SubmitButton />`). |
| `useTransition()` | Returns `[isPending, startTransition]`. **Wraps state updates** that should not block the UI. Used when calling actions imperatively (NOT from `<form action>`). |
| `useEffect(() => ..., [state])` | Reacts to `state` changes — show toast, navigate, reset fields. |

### The right shape

```tsx
// app/sites/site-form.tsx
'use client'
import { useActionState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { createSite } from './actions'

const initial = { ok: false, message: '' }

export function SiteForm() {
  const [state, formAction, pending] = useActionState(createSite, initial)
  const router = useRouter()

  useEffect(() => {
    if (!state.message) return
    if (state.ok) {
      toast.success(state.message)
      if (state.siteId) router.push(`/sites/${state.siteId}`)
    } else {
      toast.error(state.message)
    }
  }, [state, router])

  return (
    <form action={formAction}>
      <input name="domain" type="url" required />
      <button disabled={pending}>Create</button>
    </form>
  )
}
```

The response is in `state`. The toast is fired by `useEffect` watching `state`. Pending state comes from `useActionState`.

## 6. THE anti-pattern — `useTransition` with `await action()`

This is the single most common mistake — and the one this skill exists for.

### WRONG

```tsx
'use client'
import { useTransition, useState } from 'react'

const [isPending, startTransition] = useTransition()
const [resp, setResp] = useState(null)

function onClick() {
  let r
  startTransition(async () => {
    r = await createSite(formData)   // ❌ captured into a local that escapes
    setResp(r)                        // ❌ scheduled inside transition; race-prone
  })
}
```

Why it's wrong:
1. **`useTransition` is for marking state updates as non-urgent**, not for capturing return values. Awaiting inside doesn't give you the action's response in any reliable way — the transition's job is scheduling, not result-passing.
2. The response from a Server Action is what `useActionState` is **designed** to expose. By bypassing it you lose pending tracking, prev-state, and form integration.
3. You will write `setResp(r)` on the line after `await` and then add a `useEffect([resp], ...)` to react to it. At that point you have re-implemented `useActionState` poorly.

### RIGHT — let `useActionState` carry the response

```tsx
const [state, formAction, pending] = useActionState(createSite, initial)
// state IS the response. Read it directly, or in useEffect for side effects.
```

For programmatic invocation (no `<form>`, e.g. a button outside a form, a keyboard shortcut), wrap **`formAction(formData)`** call in a transition only if you also want React to keep the previous UI visible during the request:

```tsx
const [state, formAction, pending] = useActionState(createSite, initial)
const [, startTransition] = useTransition()

function handleClick(fd: FormData) {
  startTransition(() => formAction(fd))   // no await — formAction returns void
}
```

`formAction` does not return a promise to await — its result lands in `state`.

## 7. Client-side fetching — TanStack Query

When client-side fetching is the right choice (§2), use **TanStack Query** (`@tanstack/react-query`). Do NOT roll your own `useEffect(() => fetch(...))`.

Why TanStack Query and not SWR:
- Mature mutation API — pairs well with the rare client-initiated mutation outside the Server Action flow
- Query invalidation, retry, dedupe, devtools — all there
- Works with the App Router via a `QueryClientProvider` in a Client Component at the root layout boundary

```tsx
// app/providers.tsx
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
```

```tsx
'use client'
import { useQuery } from '@tanstack/react-query'

export function LiveCrawlStatus({ crawlId }: { crawlId: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['crawl', crawlId, 'status'],
    queryFn: () => fetch(`/api/crawls/${crawlId}/status`).then(r => r.json()),
    refetchInterval: 2000,   // polling — only acceptable case for client fetch
  })
  if (isPending) return <Spinner />
  if (error) return <ErrorBox error={error} />
  return <StatusPill status={data.status} />
}
```

**Hydration**: when a Server Component has already fetched the data, hydrate TanStack Query instead of double-fetching:

```tsx
// Server
const queryClient = new QueryClient()
await queryClient.prefetchQuery({ queryKey: ['sites'], queryFn: getSites })
return <HydrationBoundary state={dehydrate(queryClient)}><SiteList /></HydrationBoundary>
```

If a Server Action would suffice, **prefer the Server Action**. TanStack Query exists for the cases where SSR doesn't fit (live polling, client-derived queries).

## 8. Caching — Cache Components + `'use cache'` (Next 16 default model)

Next 16 introduced **Cache Components** with **Partial Prerendering (PPR)** as the canonical caching model. The old `fetch(..., { cache: 'force-cache' | 'no-store', next: { revalidate, tags } })` API still works under the "Previous Model" path (`/docs/app/guides/caching-without-cache-components`), but new work targets the new model.

### Enable it

```ts
// next.config.ts
import type { NextConfig } from 'next'
const nextConfig: NextConfig = { cacheComponents: true }
export default nextConfig
```

### The two primitives

**`'use cache'` directive** — caches the return value of an async function/component/page. Two scopes:

```tsx
// Data-level — cache the loader
import { cacheLife, cacheTag } from 'next/cache'
export async function getSites() {
  'use cache'
  cacheLife('hours')
  cacheTag('sites')
  return db.site.findMany()
}

// UI-level — cache the rendered output
async function SiteList() {
  'use cache'
  cacheLife('hours')
  cacheTag('sites')
  const sites = await db.site.findMany()
  return <ul>{sites.map(s => <li key={s.id}>{s.domain}</li>)}</ul>
}
```

Function arguments and any closed-over values become part of the cache key automatically — different inputs → different entries. `cacheLife('seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max')` sets the freshness window. `cacheTag('...')` tags for manual invalidation.

**`<Suspense>` for uncached** — anything that depends on per-request data (cookies, headers, searchParams, params, runtime fetch) MUST be inside a `<Suspense>` boundary. With Cache Components enabled, accessing uncached data outside `<Suspense>` is a build/dev error: `"Uncached data was accessed outside of <Suspense>"`.

```tsx
import { cookies } from 'next/headers'
import { Suspense } from 'react'

async function UserPanel() {
  const theme = (await cookies()).get('theme')?.value
  return <p>Theme: {theme}</p>
}

export default function Page() {
  return (
    <>
      <h1>Dashboard</h1>
      <Suspense fallback={<p>Loading panel...</p>}>
        <UserPanel />
      </Suspense>
    </>
  )
}
```

### Invalidation — `updateTag` from Server Actions

```ts
import { updateTag } from 'next/cache'

export async function createSite(prev: State, fd: FormData): Promise<State> {
  'use server'
  // ...
  updateTag('sites')   // expires every cached entry tagged 'sites' immediately
  return { ok: true, message: 'Site created' }
}
```

`updateTag` is the new-model counterpart of the legacy `revalidateTag`. Both still exist but the docs use `updateTag` with Cache Components.

### Non-deterministic operations

`Math.random()`, `Date.now()`, `crypto.randomUUID()` won't compile inside a prerendered shell — Next 16 forces you to choose:

```tsx
// (a) Per-request: defer to runtime with connection() inside a <Suspense>
import { connection } from 'next/server'
async function RequestId() {
  await connection()
  return <p>{crypto.randomUUID()}</p>
}

// (b) Build-time / cached: 'use cache' so all visitors see the same value
export default async function Page() {
  'use cache'
  return <p>Build {crypto.randomUUID()}</p>
}
```

### Mental model — Partial Prerendering

At build time Next 16 renders the tree:
- `'use cache'` outputs become part of the **static shell**
- `<Suspense>` boundaries reserve a hole for streamed content
- Pure / deterministic computation (synchronous I/O, module imports) is inlined into the shell

At request time the shell is sent **immediately**, then uncached chunks stream in. There is no longer a "static page" vs "dynamic page" binary — every page is a shell + streamed islands.

### Putting it together

```tsx
import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { cacheLife, cacheTag } from 'next/cache'

export default function Page() {
  return (
    <>
      <header><h1>Sites</h1></header>             {/* static shell */}
      <SiteList />                                 {/* cached, in shell */}
      <Suspense fallback={<UserPanelSkeleton />}>
        <UserPanel />                              {/* runtime, streamed */}
      </Suspense>
    </>
  )
}

async function SiteList() {
  'use cache'
  cacheLife('hours')
  cacheTag('sites')
  const sites = await db.site.findMany()
  return <ul>{sites.map(s => <li key={s.id}>{s.domain}</li>)}</ul>
}

async function UserPanel() {
  const theme = (await cookies()).get('theme')?.value
  return <p>Theme: {theme}</p>
}
```

### Decision table

| Data shape | Where it goes |
|---|---|
| Same for everyone, changes infrequently | `'use cache'` + `cacheLife('hours')` (or longer) |
| Same for everyone, must be fresh | `'use cache'` + `cacheLife('seconds')` or short tag-based invalidation |
| Per-user, derived from `cookies()`/`headers()` | `<Suspense>` around the component reading runtime data |
| Per-user, expensive query — keyed by user ID | Read user from runtime, pass ID to a `'use cache'` child component |
| Live polling / WebSocket | Client Component + TanStack Query (§7) |

Reach for the legacy `fetch` cache options only when you're maintaining a Next 14/15 codebase that hasn't migrated. New routes target Cache Components.

## 9. Hard rules (don't break these)

- **Never** await a Server Action's return value inside `startTransition`. Use `useActionState`.
- **Never** put `'use client'` on a file that fetches secrets / talks to an internal DB. Server-only data on the server, period.
- **Never** validate auth only in `proxy.ts` — every Server Action re-checks.
- **Never** use `useEffect(() => fetch(...))` as the default client read. Either move to a Server Component, or use TanStack Query.
- **Never** assume `fetch` is cached. State the cache mode explicitly.
- **Never** leave a `loading.tsx` covering uncached layout data — the docs spell out that this fails over; use `<Suspense>` close to the data.

## 10. Common traps

- Mixing `useFormStatus` and `useActionState` for `pending`. They both work — pick one. `useFormStatus` lives in a child component (button); `useActionState` lives where the action is bound. Don't read both for the same form.
- Calling `formAction(fd)` and then trying to `await` it. It returns `void`. The result is in `state` after re-render.
- Forgetting that `params`, `cookies()`, `headers()` are async in Next 15+. Always `await`.
- Using `useEffect` to fire a Server Action on mount. That defeats progressive enhancement — if the user has JS off, nothing happens. Move it server-side or accept the trade-off explicitly.
- Reaching for TanStack Query for a one-shot read. If it's a one-time fetch on a page load, that's a Server Component.
