---
name: drf-patterns
description: Apply when building or modifying Django REST Framework views, serializers, or viewsets. Covers ViewSet selection, pagination, filtering, throttling, permissions, and versioning.
---

# DRF patterns

## 1. Pick the right base class

| Need | Use |
|---|---|
| Full CRUD on a model | `ModelViewSet` |
| Read-only CRUD | `ReadOnlyModelViewSet` |
| Custom mix of mixins | `GenericViewSet` + `ListModelMixin` etc. |
| Single endpoint, no queryset | `APIView` |
| Function-style, simple | `@api_view(['POST'])` |

Don't reach for `APIView` when `ModelViewSet` would work — you'll re-implement pagination, filtering, and permissions for nothing.

## 2. Pagination — cursor for feeds

```python
from rest_framework.pagination import CursorPagination

class CrawlPagination(CursorPagination):
    page_size = 50
    ordering = '-started_at'
    cursor_query_param = 'cursor'
```

Cursor pagination is stable under inserts (offset isn't — items shift between pages as new rows arrive). Use cursor for any list that grows over time.

Page-number pagination is fine for small, mostly-static datasets.

## 3. Filtering — django-filter, not manual

```python
from django_filters import rest_framework as filters

class CrawlFilterSet(filters.FilterSet):
    started_after = filters.DateTimeFilter(field_name='started_at', lookup_expr='gte')
    status = filters.ChoiceFilter(choices=Crawl.Status.choices)

    class Meta:
        model = Crawl
        fields = ['site', 'status', 'started_after']

class CrawlViewSet(ModelViewSet):
    filterset_class = CrawlFilterSet
```

NEVER write filter logic inside `get_queryset()` if `FilterSet` would do it. You'll forget about `__icontains` injection or boolean parsing.

## 4. Permissions per action

Different actions have different rules:

```python
class SiteViewSet(ModelViewSet):
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [IsAuthenticated()]
        if self.action == 'destroy':
            return [IsAuthenticated(), IsOrgAdmin()]
        return [IsAuthenticated(), IsSiteOwner()]
```

Always declare `permission_classes` or `get_permissions` explicitly. Don't rely on the global default — too easy to forget.

## 5. Serializer separation

Different shapes for different actions:

```python
class SiteListSerializer(ModelSerializer):
    class Meta:
        model = Site
        fields = ['id', 'domain', 'status']  # lean

class SiteDetailSerializer(ModelSerializer):
    keywords = KeywordSerializer(many=True, read_only=True)
    latest_crawl = serializers.SerializerMethodField()

    class Meta:
        model = Site
        fields = '__all__'

class SiteWriteSerializer(ModelSerializer):
    class Meta:
        model = Site
        fields = ['domain', 'plan']  # only what's writable

class SiteViewSet(ModelViewSet):
    def get_serializer_class(self):
        if self.action == 'list':
            return SiteListSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return SiteWriteSerializer
        return SiteDetailSerializer
```

List serializers should be lean — list endpoints get hammered. Avoid nested expansion in lists unless the client really needs it.

## 6. Throttling

```python
class CrawlViewSet(ModelViewSet):
    throttle_classes = [UserRateThrottle, ScopedRateThrottle]
    throttle_scope = 'crawl_create'

    def get_throttles(self):
        if self.action == 'create':
            return [ScopedRateThrottle()]
        return [UserRateThrottle()]
```

In settings:
```python
REST_FRAMEWORK = {
    'DEFAULT_THROTTLE_RATES': {
        'crawl_create': '10/min',
        'user': '1000/hour',
        'anon': '20/hour',
    }
}
```

## 7. Versioning

URL-based is simplest:
```python
path('api/v1/', include('api.v1.urls')),
path('api/v2/', include('api.v2.urls')),
```

Don't introduce versioning until you need to break the contract. Premature versioning = duplicated code, drifting bugs.

## 8. Don't put business logic in serializers

Serializers shape data in/out. Business logic = service layer or model methods.

```python
# WRONG
class CrawlSerializer(ModelSerializer):
    def create(self, validated_data):
        crawl = Crawl.objects.create(**validated_data)
        ... 50 lines of business logic ...
        return crawl

# RIGHT
class CrawlViewSet(ModelViewSet):
    def perform_create(self, serializer):
        from crawls.services import start_crawl
        crawl = start_crawl(
            site_id=serializer.validated_data['site'].id,
            user=self.request.user,
        )
        serializer.instance = crawl
```

A serializer with > 30 lines of `validate_*` logic is a smell.

## 9. Performance

- Override `get_queryset()` to apply `select_related` / `prefetch_related` based on the action.
- Use `pagination_class` per viewset, not global, for endpoints with different shapes.
- For list endpoints with lots of joins, consider read-side materialized views or denormalized fields.

```python
class SiteViewSet(ModelViewSet):
    def get_queryset(self):
        qs = Site.objects.filter(owner_org__memberships__user=self.request.user)
        if self.action == 'retrieve':
            qs = qs.select_related('plan').prefetch_related('keywords')
        return qs.distinct()
```
