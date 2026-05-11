from django_filters import rest_framework as filters

from .models import Page


class PageFilter(filters.FilterSet):
    domain = filters.NumberFilter(field_name='domain_id')
    host = filters.CharFilter(field_name='domain__host', lookup_expr='icontains')
    http_status = filters.NumberFilter(field_name='http_status')
    language = filters.CharFilter(field_name='language')
    search = filters.CharFilter(method='search_title_url')

    class Meta:
        model = Page
        fields = ['domain', 'host', 'http_status', 'language', 'search']

    def search_title_url(self, queryset, name, value):
        return queryset.filter(title__icontains=value) | queryset.filter(url__icontains=value)
