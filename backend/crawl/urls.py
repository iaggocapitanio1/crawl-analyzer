from django.urls import path, include
from rest_framework import routers

from . import views

router = routers.DefaultRouter()
router.register(r'domains', views.DomainViewSet, basename='domain')
router.register(r'pages', views.PageViewSet, basename='page')
router.register(r'exports', views.ExportJobViewSet, basename='export')

urlpatterns = [
    path('stats/', views.stats_view, name='stats'),
    path('', include(router.urls)),
]
