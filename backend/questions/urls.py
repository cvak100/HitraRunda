from django.urls import path

from questions.staff_content import (
    AdminCategoryDetailView,
    AdminCategoryListView,
    AdminContentQualityView,
    AdminQuestionDeactivateActiveView,
    AdminQuestionExportView,
    AdminQuestionImportView,
)
from questions.views import (
    AdminQuestionDetailView,
    AdminQuestionListView,
    AdminSummaryView,
    AdminReportListView,
    AdminReportReviewView,
    CategoryListView,
    ReportCreateView,
)

urlpatterns = [
    path("categories/", CategoryListView.as_view()),
    path("reports/", ReportCreateView.as_view()),
    path("admin/summary/", AdminSummaryView.as_view()),
    path("admin/questions/", AdminQuestionListView.as_view()),
    path("admin/questions/import/", AdminQuestionImportView.as_view()),
    path("admin/questions/export/", AdminQuestionExportView.as_view()),
    path("admin/questions/deactivate-active/", AdminQuestionDeactivateActiveView.as_view()),
    path("admin/questions/<int:pk>/", AdminQuestionDetailView.as_view()),
    path("admin/categories/", AdminCategoryListView.as_view()),
    path("admin/categories/<int:pk>/", AdminCategoryDetailView.as_view()),
    path("admin/content-quality/", AdminContentQualityView.as_view()),
    path("admin/reports/", AdminReportListView.as_view()),
    path("admin/reports/<int:pk>/", AdminReportReviewView.as_view()),
]
