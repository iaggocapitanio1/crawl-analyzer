from django.contrib import admin

from .models import Domain, Page, PageLink, StatsSnapshot, ExportJob

admin.site.register(Domain)
admin.site.register(Page)
admin.site.register(PageLink)
admin.site.register(StatsSnapshot)
admin.site.register(ExportJob)
