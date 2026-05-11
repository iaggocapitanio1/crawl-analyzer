---
name: quality-frontend
description: Run the full pre-commit quality gate on the Next.js frontend — ESLint, TypeScript typecheck, Prettier, supply-chain audit at high severity, tests, production build, then nextjs-reviewer. Stops on the first hard failure. Use before every frontend commit.
---

# Quality gate — Next.js frontend

Run from project root. Operates on `frontend/`. Three stages, executed in order.

## Pre-flight

Detect the package manager from the lockfile in `frontend/`:

| Lockfile present | Use |
|---|---|
| `pnpm-lock.yaml` | `pnpm` |
| `bun.lock` / `bun.lockb` | `bun` |
| `yarn.lock` | `yarn` |
| `package-lock.json` | `npm` |

If `frontend/` does not exist or contains no `package.json`, stop the gate with a single line: `frontend not initialized — gate skipped`. Do not invent commands against an empty directory.

Below, `<pm>` is the detected package manager. Read `frontend/package.json` `scripts` to confirm each script name exists; if a script is missing, log SKIP with the exact name needed.

## Stage 1 — fast Bash checks (sequential, bail on hard fail)

Each command runs from `frontend/`. Track each as `PASS / FAIL / SKIP`.

| # | Command | Hard fail? | Skip if |
|---|---|---|---|
| 1 | `<pm> run lint` (ESLint) | yes | no `lint` script |
| 2 | `<pm> run typecheck` (`tsc --noEmit`) | yes | no `typecheck` script and no `tsconfig.json` |
| 3 | `<pm> run format:check` (Prettier) | yes | no `format:check` script |
| 4 | `<pm> run audit` (`pnpm audit --prod --audit-level high`) | yes | no `audit` script AND no lockfile |
| 5 | `<pm> run test -- --run` (Vitest) or equivalent unit-test command | yes | no test runner configured AND no `*.test.*` files |
| 6 | `<pm> run build` (`next build`) | **yes — this is the most important check** | n/a, must succeed |

Why audit at `--audit-level high` and not `moderate`:
- Transitive moderate vulns (e.g. regex DoS in postcss reachable only via attacker-controlled CSS input) generate constant noise on a fresh `next` install — gate would block on day-one, on something the team can't fix until the upstream library bumps.
- High/Critical is the industry standard threshold (GitHub Dependabot default, Snyk default).
- Moderate vulns are still **listed** in the audit output (informational), just not fail-the-gate.
- If a specific moderate is genuinely concerning, ignore it explicitly via `pnpm.auditConfig.ignoreGhsas` in `package.json` — surfaces the decision in code review.

Why `next build` is the gate's keystone for App Router:
- Catches Server Component / Client Component boundary violations at compile time
- Catches `'use client'` files importing server-only data (the `No secrets in client bundle` rule)
- Catches missing `Suspense` around dynamic data
- Catches static-analysis errors that dev mode hides

If `build` fails, **always FAIL the gate**. Don't try to interpret why — show the build output and stop.

Bail conditions: any hard fail in Stage 1 stops the gate. Don't proceed to Stage 2 on a broken build.

## Stage 2 — agent reviews (parallel)

Invoke via `Task` in a single message so they run concurrently:

- `nextjs-reviewer` — Server/Client boundary leaks, request waterfalls, cache misuse, Server Action security

If the diff also touches backend service code (full-stack PR), invoke `observability-reviewer` here too — Server Actions and Route Handlers are I/O boundaries that benefit from tracing checks.

Do NOT invoke `django-reviewer` from this gate — frontend changes don't trigger Django review. Run `/quality-django` separately if the same PR touches `backend/`.

## Stage 3 — aggregate and verdict

```
QUALITY GATE — Next.js frontend
Package manager: <pm>

Stage 1 (Bash):
  lint .................... PASS / FAIL / SKIP (reason)
  typecheck ............... PASS / FAIL / SKIP
  format:check ............ PASS / FAIL / SKIP
  audit (high) ............ PASS / FAIL / SKIP
  tests ................... PASS / FAIL / SKIP
  build ................... PASS / FAIL  (always run, never SKIP)

Stage 2 (Reviews):
  nextjs-reviewer:
    CRITICAL: <count>   WARNING: <count>   NIT: <count>
    <top 3 critical findings, one line each>
  [observability-reviewer if invoked]

OVERALL: PASS | FAIL
```

`OVERALL: PASS` requires:
- Stage 1 step 5 (`build`) is PASS — non-negotiable
- Every other Stage 1 step is PASS or SKIP-with-justification
- Stage 2 returns zero CRITICAL findings

Any CRITICAL or any Stage 1 hard fail → `OVERALL: FAIL`. List the blockers.

## Hard rules

- `next build` MUST run and MUST pass. It's the only check that catches RSC/Client boundary violations reliably. Never skip it, never mark it SOFT.
- Never report PASS while skipping a check that should exist. If ESLint is configured but no `lint` script wraps it, that's a config gap — FAIL with the suggested script.
- Never auto-fix. Report and let the user run `<pm> run lint --fix` or `<pm> run format` themselves.
- Never invoke agents if Stage 1 hard-failed.
- Never use the dev server (`next dev`) as a quality signal. Dev mode hides errors that `next build` surfaces.
- If the project uses Turbopack or a non-default builder, run whatever `package.json`'s `build` script defines — do not invent a different build command.
