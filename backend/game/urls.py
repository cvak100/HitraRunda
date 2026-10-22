from django.urls import path

from game.views import (
    AdminSessionDetailView,
    AdminSessionListView,
    HealthView,
    LeaderboardView,
    MyResultsView,
    ResultDetailView,
)

urlpatterns = [
    path("health/", HealthView.as_view()),
    path("leaderboard/", LeaderboardView.as_view()),
    path("me/results/", MyResultsView.as_view()),
    path("results/<int:pk>/", ResultDetailView.as_view()),
    path("admin/sessions/", AdminSessionListView.as_view()),
    path("admin/sessions/<int:pk>/", AdminSessionDetailView.as_view()),
]
