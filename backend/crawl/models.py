from django.db import models


class Domain(models.Model):
    host = models.CharField(max_length=255, unique=True, db_index=True)
    registered_domain = models.CharField(max_length=255, db_index=True)
    tld = models.CharField(max_length=63)
    first_seen_at = models.DateTimeField()
    last_seen_at = models.DateTimeField()
    page_count = models.IntegerField(default=0)

    authority_score = models.IntegerField(null=True, blank=True)
    authority_fetched_at = models.DateTimeField(null=True, blank=True, db_index=True)
    backlink_count = models.IntegerField(null=True, blank=True)
    backlinks_fetched_at = models.DateTimeField(null=True, blank=True, db_index=True)

    last_refresh_enqueued_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.host


class Page(models.Model):
    domain = models.ForeignKey(Domain, on_delete=models.CASCADE, related_name='pages', db_index=True)
    url = models.CharField(max_length=2048, db_index=True)
    http_status = models.IntegerField(db_index=True)
    content_type = models.CharField(max_length=255, blank=True, default='')
    content_length = models.BigIntegerField(null=True, blank=True)
    fetched_at = models.DateTimeField(db_index=True)
    title = models.CharField(max_length=1024, blank=True, default='')
    description = models.TextField(blank=True, default='')
    meta_keywords = models.TextField(blank=True, default='')
    language = models.CharField(max_length=16, null=True, blank=True, db_index=True)

    seo_score = models.IntegerField(null=True, blank=True)
    seo_fetched_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_refresh_enqueued_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.url


class PageLink(models.Model):
    LINK_TYPES = [
        ('a', 'Anchor'),
        ('img', 'Image'),
        ('script', 'Script'),
        ('link', 'Link element'),
        ('iframe', 'IFrame'),
    ]
    from_page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name='links')
    to_url = models.CharField(max_length=2048)
    anchor_text = models.CharField(max_length=1024, null=True, blank=True)
    link_type = models.CharField(max_length=16, choices=LINK_TYPES, default='a')
    position = models.IntegerField(default=0)

    def __str__(self):
        return f'{self.from_page_id} -> {self.to_url}'


class StatsSnapshot(models.Model):
    computed_at = models.DateTimeField(db_index=True)
    total_domains = models.IntegerField()
    total_pages = models.IntegerField()
    total_backlinks = models.IntegerField()
    pages_2xx = models.IntegerField(default=0)
    pages_4xx = models.IntegerField(default=0)
    pages_5xx = models.IntegerField(default=0)

    class Meta:
        ordering = ['-computed_at']


class ExportJob(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('running', 'Running'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    filter_params = models.JSONField(default=dict)
    format = models.CharField(max_length=16, default='csv')
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='pending')
    file_path = models.CharField(max_length=1024, null=True, blank=True)
    row_count = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    error = models.JSONField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
