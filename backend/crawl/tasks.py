"""Celery tasks.

Only the export job task ships. Any refresh/enrichment pipelines are
introduced when needed.
"""
import csv
import os
from datetime import datetime

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from .models import ExportJob, Page


@shared_task
def build_export(export_job_id: int) -> None:
    """Materialize an ExportJob's CSV on disk.

    Reads the filter_params off the job, runs a matching Page queryset, and
    writes a CSV next to other exports. Marks the job completed with the
    file path + row count.
    """
    job = ExportJob.objects.get(pk=export_job_id)
    job.status = 'running'
    job.save(update_fields=['status'])

    qs = Page.objects.select_related('domain').all()
    params = job.filter_params or {}
    if 'domain' in params:
        qs = qs.filter(domain_id=params['domain'])
    if 'http_status' in params:
        qs = qs.filter(http_status=params['http_status'])
    if 'language' in params:
        qs = qs.filter(language=params['language'])
    if 'search' in params:
        search = params['search']
        qs = qs.filter(title__icontains=search) | qs.filter(url__icontains=search)

    os.makedirs(settings.EXPORTS_ROOT, exist_ok=True)
    filename = f'export_{job.id}.csv'
    path = os.path.join(settings.EXPORTS_ROOT, filename)

    row_count = 0
    with open(path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['url', 'host', 'http_status', 'title', 'language', 'fetched_at'])
        for page in qs.iterator():
            writer.writerow([
                page.url, page.domain.host, page.http_status,
                page.title, page.language or '', page.fetched_at.isoformat(),
            ])
            row_count += 1

    job.status = 'completed'
    job.file_path = path
    job.row_count = row_count
    job.completed_at = timezone.now()
    job.save(update_fields=['status', 'file_path', 'row_count', 'completed_at'])
