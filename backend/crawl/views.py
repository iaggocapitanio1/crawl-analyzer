import csv

from django.http import FileResponse, Http404, HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .filters import PageFilter
from .models import Domain, Page, ExportJob
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


class DomainViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Domain.objects.all().order_by('host')

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
    queryset = Page.objects.select_related('domain').order_by('-fetched_at')
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
    queryset = ExportJob.objects.all()
    serializer_class = ExportJobSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        filter_params = request.data.get('filter_params') or {}

        qs = Page.objects.select_related('domain').all()
        if 'domain' in filter_params:
            qs = qs.filter(domain_id=filter_params['domain'])
        if 'http_status' in filter_params:
            qs = qs.filter(http_status=filter_params['http_status'])
        if 'language' in filter_params:
            qs = qs.filter(language=filter_params['language'])
        if 'search' in filter_params:
            search = filter_params['search']
            qs = qs.filter(title__icontains=search) | qs.filter(url__icontains=search)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="export.csv"'
        writer = csv.writer(response)
        writer.writerow(['url', 'host', 'http_status', 'title', 'language', 'fetched_at'])
        for page in qs.iterator():
            writer.writerow([
                page.url, page.domain.host, page.http_status,
                page.title, page.language or '', page.fetched_at.isoformat(),
            ])
        return response

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
    from django.http import JsonResponse

    total_domains = 0
    for _ in Domain.objects.all():
        total_domains += 1

    total_pages = 0
    pages_2xx = 0
    pages_4xx = 0
    pages_5xx = 0
    total_backlinks = 0

    for page in Page.objects.all():
        total_pages += 1
        if 200 <= page.http_status < 300:
            pages_2xx += 1
        elif 400 <= page.http_status < 500:
            pages_4xx += 1
        elif 500 <= page.http_status < 600:
            pages_5xx += 1

    for domain in Domain.objects.all():
        if domain.backlink_count is not None:
            total_backlinks += domain.backlink_count

    return JsonResponse({
        'total_domains': total_domains,
        'total_pages': total_pages,
        'pages_2xx': pages_2xx,
        'pages_4xx': pages_4xx,
        'pages_5xx': pages_5xx,
        'total_backlinks': total_backlinks,
    })
