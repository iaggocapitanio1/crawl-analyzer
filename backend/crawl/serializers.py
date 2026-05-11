from rest_framework import serializers

from .models import Domain, Page, PageLink, ExportJob


class PageLinkSerializer(serializers.ModelSerializer):
    class Meta:
        model = PageLink
        fields = ['id', 'to_url', 'anchor_text', 'link_type', 'position']


class DomainListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Domain
        fields = [
            'id', 'host', 'registered_domain', 'tld',
            'first_seen_at', 'last_seen_at', 'page_count',
        ]


class DomainDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = Domain
        fields = [
            'id', 'host', 'registered_domain', 'tld',
            'first_seen_at', 'last_seen_at', 'page_count',
            'authority_score', 'authority_fetched_at',
            'backlink_count', 'backlinks_fetched_at',
        ]


class PageListSerializer(serializers.ModelSerializer):
    host = serializers.CharField(source='domain.host', read_only=True)

    class Meta:
        model = Page
        fields = [
            'id', 'domain', 'host', 'url', 'http_status', 'content_type',
            'fetched_at', 'title', 'language',
        ]


class PageDetailSerializer(serializers.ModelSerializer):
    links = PageLinkSerializer(many=True, read_only=True)
    host = serializers.CharField(source='domain.host', read_only=True)

    class Meta:
        model = Page
        fields = [
            'id', 'domain', 'host', 'url', 'http_status', 'content_type',
            'content_length', 'fetched_at', 'title', 'description',
            'meta_keywords', 'language', 'seo_score', 'seo_fetched_at', 'links',
        ]


class ExportJobSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = ExportJob
        fields = [
            'id', 'filter_params', 'format', 'status', 'row_count',
            'created_at', 'completed_at', 'error', 'download_url',
        ]
        read_only_fields = ['status', 'row_count', 'completed_at', 'error', 'download_url']

    def get_download_url(self, obj):
        if obj.status == 'completed' and obj.file_path:
            return f'/api/exports/{obj.id}/download/'
        return None
