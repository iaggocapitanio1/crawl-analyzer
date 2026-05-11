---
name: django-orm-patterns
description: Apply when writing or modifying Django ORM queries, model fields, indexes, or migrations. Covers N+1 prevention, query optimization, and zero-downtime migration patterns for Django 5.2.
---

# Django ORM patterns

## 1. Always pre-fetch related fields

For ForeignKey / OneToOne accessed in a loop:
```python
sites = Site.objects.select_related('owner_org', 'plan').all()
for site in sites:
    print(site.owner_org.name)  # no extra query
```

For ManyToMany / reverse FK:
```python
sites = Site.objects.prefetch_related('keywords').all()
```

Nested:
```python
Site.objects.prefetch_related(
    Prefetch('keywords', queryset=Keyword.objects.select_related('latest_serp'))
)
```

Rule: any `.all()` followed by a Python loop that touches a related field is N+1 until proven otherwise.

## 2. Indexes on filter / order / unique fields

Any field used in `filter()`, `order_by()`, `unique=True`, or as FK target should have an index. Django auto-indexes FK and unique. For composite filters, use `Meta.indexes`:

```python
class Crawl(models.Model):
    site = models.ForeignKey(Site, on_delete=models.CASCADE)
    started_at = models.DateTimeField()
    status = models.CharField(max_length=20)

    class Meta:
        indexes = [
            models.Index(fields=['site', '-started_at']),
            models.Index(
                fields=['status', 'started_at'],
                condition=Q(status='pending'),
                name='pending_crawls_idx',
            ),
        ]
```

Partial indexes (`condition=`) are great for hot subsets — "pending crawls" is a tiny slice of total crawls.

## 3. Zero-downtime migrations

Adding NOT NULL column to populated table = downtime. Three deploys:

1. **Deploy 1**: add column nullable, no constraints
2. **Deploy 2**: backfill via management command or RunPython migration (chunked)
3. **Deploy 3**: alter to NOT NULL, add constraints

Renaming a column on a big table:
1. Add new column, dual-write in code (write to both)
2. Backfill old → new
3. Switch reads to new
4. Drop dual-write, drop old column

NEVER use `migrations.RenameField` on a hot table — Django emits `ALTER TABLE` which locks.

## 4. Query optimization

- `.only('id', 'domain')` / `.defer('big_json_field')` for big columns you don't need
- `.exists()` not `.count() > 0`
- `.iterator(chunk_size=2000)` for batch processing big tables
- `bulk_create(objs, batch_size=1000)` / `bulk_update` instead of save loops
- Aggregate at DB: `Count`, `Sum`, `Avg`, `F` expressions
- `update()` + `F()` for atomic counter increments — never `obj.counter += 1; obj.save()`

## 5. Common traps

- `Meta.ordering` triggers ORDER BY on every query. For hot tables, set a manager without ordering and use it on hot paths.
- `__in` with > 10k IDs = slow Postgres plan. Chunk into batches of 1k.
- `auto_now_add` is add-only (doesn't update). `auto_now` updates on every save.
- `Q(field__isnull=True)` ≠ `~Q(field=value)` due to NULL semantics.
- `get_or_create` is NOT atomic without `select_for_update` or unique constraint — race conditions possible.
- `prefetch_related` with `filter()` afterwards re-runs the query. Use `Prefetch` with a custom queryset.

## 6. Django 5.2-specific wins

- **Composite primary keys**: `CompositePrimaryKey('field_a', 'field_b')` — useful for join tables that already have a natural composite key.
- **Auto model imports in shell**: `python manage.py shell` now imports all models — no boilerplate.
- **`reverse()` with query/fragment**: `reverse('site-detail', query={'tab': 'keywords'}, fragment='top')`.

## 7. When to drop to raw SQL

Use raw SQL when:
- The ORM generates a plan you can't fix (CTE, recursive, window functions you can't express)
- A single hot query needs hand-tuning (after EXPLAIN ANALYZE)

Always use `params=` — never f-string interpolation:
```python
Site.objects.raw('SELECT * FROM sites_site WHERE domain = %s', [domain])
```
