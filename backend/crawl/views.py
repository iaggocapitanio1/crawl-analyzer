from django.db import transaction
from django.db.models import Count, Q, Sum
from django.http import FileResponse, Http404, JsonResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from .filters import PageFilter
from .models import Domain, Page, ExportJob
from .pagination import StandardPagination
from .providers import (
    fetch_domain_authority,
    fetch_backlink_count,
    fetch_page_seo_score,
)
from .serializers import (
    DomainListSerializer,
    DomainDetailSerializer,
    PageListSerializer,
    PageDetailSerializer,
    ExportJobSerializer,
)
from .tasks import build_export


class DomainViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Domain.objects.all().order_by('host')
    pagination_class = StandardPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ['host', 'registered_domain']
    ordering_fields = ['host', 'first_seen_at', 'last_seen_at', 'page_count']
    ordering = ['host']

    def get_serializer_class(self):
        if self.action == 'list':
            return DomainListSerializer
        return DomainDetailSerializer

    @action(detail=True, methods=['get'])
    def insights(self, request, pk=None):
        domain = self.get_object()

        score = fetch_domain_authority(domain.host)
        domain.authority_score = score
        domain.authority_fetched_at = timezone.now()
        domain.save(update_fields=['authority_score', 'authority_fetched_at'])

        return Response({
            'domain': domain.host,
            'authority_score': domain.authority_score,
            'fetched_at': domain.authority_fetched_at,
        })

    @action(detail=True, methods=['get'])
    def backlinks(self, request, pk=None):
        domain = self.get_object()

        count = fetch_backlink_count(domain.host)
        domain.backlink_count = count
        domain.backlinks_fetched_at = timezone.now()
        domain.save(update_fields=['backlink_count', 'backlinks_fetched_at'])

        return Response({
            'domain': domain.host,
            'backlink_count': domain.backlink_count,
            'fetched_at': domain.backlinks_fetched_at,
        })


class PageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = (
        Page.objects
        .select_related('domain')
        .prefetch_related('links')
        .order_by('-fetched_at')
    )
    filter_backends = [DjangoFilterBackend]
    filterset_class = PageFilter

    def get_serializer_class(self):
        if self.action == 'list':
            return PageListSerializer
        return PageDetailSerializer

    @action(detail=True, methods=['get'], url_path='seo-score')
    def seo_score(self, request, pk=None):
        page = self.get_object()

        score = fetch_page_seo_score(page.url)
        page.seo_score = score
        page.seo_fetched_at = timezone.now()
        page.save(update_fields=['seo_score', 'seo_fetched_at'])

        return Response({
            'page': page.url,
            'seo_score': page.seo_score,
            'fetched_at': page.seo_fetched_at,
        })


class ExportJobViewSet(viewsets.ModelViewSet):
    queryset = ExportJob.objects.all().order_by('-created_at')
    serializer_class = ExportJobSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        job = serializer.save(status='pending')

        transaction.on_commit(lambda: build_export.delay(job.id))

        return Response(
            self.get_serializer(job).data,
            status=status.HTTP_202_ACCEPTED,
        )

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        job = self.get_object()
        if job.status != 'completed' or not job.file_path:
            return Response({'detail': 'export not ready'}, status=status.HTTP_409_CONFLICT)
        try:
            return FileResponse(open(job.file_path, 'rb'), as_attachment=True, filename='export.csv')
        except FileNotFoundError:
            raise Http404('export file missing')


def stats_view(request):
    """Dashboard KPIs."""
    page_stats = Page.objects.aggregate(
        total=Count('id'),
        pages_2xx=Count('id', filter=Q(http_status__gte=200, http_status__lt=300)),
        pages_4xx=Count('id', filter=Q(http_status__gte=400, http_status__lt=500)),
        pages_5xx=Count('id', filter=Q(http_status__gte=500, http_status__lt=600)),
    )
    domain_stats = Domain.objects.aggregate(
        total=Count('id'),
        total_backlinks=Sum('backlink_count'),
    )

    return JsonResponse({
        'total_domains': domain_stats['total'],
        'total_pages': page_stats['total'],
        'pages_2xx': page_stats['pages_2xx'],
        'pages_4xx': page_stats['pages_4xx'],
        'pages_5xx': page_stats['pages_5xx'],
        'total_backlinks': domain_stats['total_backlinks'] or 0,
    })
