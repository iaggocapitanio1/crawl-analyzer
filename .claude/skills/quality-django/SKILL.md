---
name: quality-django
description: Run the full pre-commit quality gate on the Django backend — ruff lint+format, Django system checks, pending migrations, OpenAPI schema validation, pytest with 85% coverage, then django-reviewer + observability-reviewer in parallel. Stops on the first hard failure. Use before every backend commit.
---

# Quality gate — Django backend

Run from project root. Operates on `backend/`. Three stages, executed in order.

## Stage 1 — fast Bash checks (sequential, bail on hard fail)

Each command runs from `backend/`. A **hard fail** stops the gate; a **soft fail** (tool not installed, no tests yet) is logged and continues. Track each as `PASS / FAIL / SKIP`.

| # | Command | Hard fail? | Skip if |
|---|---|---|---|
| 1 | `uv run ruff check .` | yes | ruff not in deps |
| 2 | `uv run ruff format --check .` | yes | ruff not in deps |
| 3 | `uv run python manage.py check` | yes | no `manage.py` (project not initialized) |
| 4 | `uv run python manage.py makemigrations --check --dry-run` | yes | no `manage.py` |
| 5 | `uv run python manage.py spectacular --validate --fail-on-warn --file /tmp/_schema.yaml` | yes | `drf-spectacular` not in deps |
| 6 | `uv run pytest --cov=. --cov-report=term-missing --cov-fail-under=85` | yes | no test files exist anywhere under `backend/` |

If a tool is missing but **expected** (ruff, pytest, drf-spectacular when DRF views exist), record a SKIP with a one-line remediation: e.g. `uv add --dev ruff`. Do not auto-install — adding deps is the user's call (per `python-deps-uv` skill).

Bail conditions:
- Step 1 or 2 fails → stop, report. Style/lint must be clean before deeper checks.
- Step 3 fails → stop. Settings or app config is broken; nothing else will pass cleanly.
- Step 4 detects pending migrations → stop. The diff is incomplete.
- Step 5 fails with `--fail-on-warn` → stop. The schema is wrong; reviewers can't trust it.
- Step 6 fails (test failure or <85% coverage) → stop. Don't ask reviewers to bless code with broken tests.

If all 6 PASS or SKIP cleanly, proceed to Stage 2.

## Stage 2 — agent reviews (parallel)

Invoke these via the `Task` tool **in a single message** so they run concurrently. Each gets the same scope: review the working diff.

- `django-reviewer` — ORM correctness, Celery safety, security, architecture, missing tests
- `observability-reviewer` — tracing gaps, vendor SDK leaks, PII in span attributes, sampling smearing

If the diff touches DRF (views/serializers/viewsets), drf-spectacular has already validated the schema in Stage 1 — no separate documenter agent needed at the gate. The reviewer agents will flag undocumented endpoints if it matters.

Do NOT invoke `pragmatism-judge` here — that's about scope decisions, a different concern.

Do NOT invoke `django-test-author` here — that's authoring, the gate is for verification.

Wait for both agents to return. Collect their findings.

## Stage 3 — aggregate and verdict

Single report:

```
QUALITY GATE — Django

Stage 1 (Bash):
  ruff check ............... PASS / FAIL / SKIP (reason)
  ruff format .............. PASS / FAIL / SKIP
  manage.py check .......... PASS / FAIL / SKIP
  pending migrations ....... PASS / FAIL / SKIP
  spectacular --validate ... PASS / FAIL / SKIP
  pytest (coverage X%) ..... PASS / FAIL / SKIP

Stage 2 (Reviews):
  django-reviewer:
    CRITICAL: <count>   WARNING: <count>   NIT: <count>
    <top 3 critical findings, one line each>
  observability-reviewer:
    CRITICAL: <count>   WARNING: <count>   NIT: <count>
    <top 3 critical findings, one line each>

OVERALL: PASS | FAIL
```

`OVERALL: PASS` requires:
- Every Stage 1 step is PASS or SKIP-with-justification
- Both Stage 2 agents return zero CRITICAL findings

Any CRITICAL or any Stage 1 hard fail → `OVERALL: FAIL`. List the blockers.

If `OVERALL: FAIL`, do not commit. Fix the blockers and re-run the gate.

## Hard rules

- Never report PASS while skipping a tool that should exist. If `pytest` is in `pyproject.toml` but no tests exist, that's FAIL with `add tests via django-test-author`, not SKIP.
- Never silence a Stage 1 failure to make the gate pass. The gate is a contract.
- Never invoke agents if Stage 1 hard-failed — wasted cycles, noisier output, and the diff isn't in a reviewable state.
- Never auto-fix lint/format. Report and let the user run `uv run ruff format .` themselves. The gate verifies, it doesn't mutate.
- Never skip Stage 2 because Stage 1 was clean — agents catch what static checks can't (N+1, vendor-SDK leaks, missing `on_commit`).
