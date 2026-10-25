from django.urls import path

from geo.staff import AdminCountryDetailView, AdminCountryImportView, AdminCountryListView

urlpatterns = [
    path("admin/countries/", AdminCountryListView.as_view()),
    path("admin/countries/import/", AdminCountryImportView.as_view()),
    path("admin/countries/<str:iso2>/", AdminCountryDetailView.as_view()),
]
