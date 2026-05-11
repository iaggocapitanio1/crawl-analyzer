---
name: nextjs-data-fetching
description: Apply when fetching data, mutating data, or deciding between Server Actions vs Route Handlers in Next.js App Router. Targets Next 15+.
---

# Next.js data fetching (Next 15+)

## 1. Read = Server Component fetch (default)

Cached, deduped, streamed. Zero client JS.

```tsx
export default async function SitesPage() {
  const sites = await fetch('https://api.searchatlas.com/sites', {
    next: { revalidate: 60 },  // ISR
  }).then(r => r.json())

  return <SiteList sites={sites} />
}
```

## 2. Cache modes (be explicit — defaults shifted in Next 15)

| Want | Code |
|---|---|
| Cache indefinitely | `cache: 'force-cache'` |
| No cache | `cache: 'no-store'` |
| Revalidate every N seconds | `next: { revalidate: 60 }` |
| Tag for manual invalidation | `next: { tags: ['sites'] }` |

Manual invalidation:
```ts
import { revalidateTag, revalidatePath } from 'next/cache'
revalidateTag('sites')
revalidatePath('/sites')
```

## 3. Parallel fetches — don't waterfall

```tsx
// WATERFALL — slow
const a = await fetchA()
const b = await fetchB()

// PARALLEL — fast
const [a, b] = await Promise.all([fetchA(), fetchB()])
```

Or split into Suspense boundaries that fetch independently.

## 4. Mutation = Server Action

For app-internal mutations (form submit, button click in your own UI):

```tsx
// app/sites/actions.ts
'use server'

import { z } from 'zod'
import { revalidateTag } from 'next/cache'
import { getSession } from '@/lib/auth'

const schema = z.object({ domain: z.string().url() })

export async function createSite(formData: FormData) {
  const session = await getSession()
  if (!session) throw new Error('unauthorized')

  const data = schema.parse({ domain: formData.get('domain') })

  const site = await db.site.create({
    data: { ...data, ownerId: session.userId },
  })
  revalidateTag('sites')
  return { id: site.id }
}
```

Rules:
- `'use server'` at top of file (or `'use server'` inside an inline function)
- Validate input with zod or similar — Server Actions are HTTP endpoints
- Auth check INSIDE the action — middleware doesn't fire reliably for actions
- `revalidateTag` / `revalidatePath` to clear cache after mutation
- Keep return values small and serializable

## 5. Route Handlers — when Server Action isn't right

Use Route Handlers for:
- **Public webhooks** (Stripe, GitHub, etc.) — need full HTTP control
- **Public APIs** consumed by mobile or external clients
- **Streaming responses** (SSE, file download)
- **Anywhere you need raw `Request` / `Response`**

```ts
// app/api/webhooks/stripe/route.ts
import { headers } from 'next/headers'

export async function POST(req: Request) {
  const sig = (await headers()).get('stripe-signature')
  const body = await req.text()
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_SECRET!)
  // ...
  return Response.json({ ok: true })
}
```

## 6. Server Action vs Route Handler — quick rule

| Question | Answer |
|---|---|
| Called from a third-party with their own protocol (Stripe, SES)? | Route Handler |
| Called from a non-Next client (mobile, external SaaS)? | Route Handler |
| Need streaming or custom Response shape? | Route Handler |
| Internal form/button in your own UI? | Server Action |
| Need to revalidate cache after mutation? | Server Action (cleaner) |

## 7. Optimistic UI

```tsx
'use client'
import { useOptimistic } from 'react'

export function SiteList({ sites, deleteSite }) {
  const [optimistic, addOptimistic] = useOptimistic(
    sites,
    (state, deletedId) => state.filter(s => s.id !== deletedId)
  )

  async function onDelete(id: string) {
    addOptimistic(id)
    await deleteSite(id)  // server action
  }

  return optimistic.map(s => <Row key={s.id} site={s} onDelete={onDelete} />)
}
```

## 8. Don't fetch in client when server can

```tsx
// WRONG — client waterfall, loading flash, no cache
'use client'
useEffect(() => { fetch('/api/sites').then(r => r.json()).then(setSites) }, [])

// RIGHT — server fetch, cached, deduped
// page.tsx (Server)
const sites = await fetch(...)
return <SiteList sites={sites} />
```

Client-side fetch is right ONLY when:
- Data depends on client-only state (search input typed by user)
- Real-time updates (WebSocket, polling)
- Infinite scroll where server-side pagination isn't a fit

For "real-time-ish", prefer revalidating Server Components via mutations + `revalidateTag` over client polling.

## 9. Forms

Native HTML form posting to a Server Action:
```tsx
import { createSite } from './actions'

export default function NewSitePage() {
  return (
    <form action={createSite}>
      <input name="domain" type="url" required />
      <button type="submit">Create</button>
    </form>
  )
}
```

For form state (errors, pending), use `useActionState` (Client Component):
```tsx
'use client'
import { useActionState } from 'react'

export function SiteForm() {
  const [state, formAction, pending] = useActionState(createSite, { error: null })
  return (
    <form action={formAction}>
      ...
      {state.error && <p>{state.error}</p>}
      <button disabled={pending}>Create</button>
    </form>
  )
}
```

## 10. Common traps

- Calling a Server Action from `useEffect` — works but loses progressive enhancement. Just use a normal fetch or move logic.
- `fetch` in a Client Component to your own Route Handler when a Server Action would do. Extra round-trip, no cache benefit.
- Forgetting that Server Action errors propagate as `error.tsx` boundaries unless caught.
- `headers()` / `cookies()` are now async in Next 15 — always `await`.
