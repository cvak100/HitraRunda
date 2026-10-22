from django.urls import path

from game.staff_content import (
    AdminBonusDetailView,
    AdminBonusListView,
    AdminFriendDetailView,
    AdminFriendListView,
    PublicFriendsView,
)
from game.views import (
    AdminSessionDetailView,
    AdminSessionListView,
    HealthView,
    LeaderboardView,
    MyResultsView,
    ProfileStatsView,
    ResultDetailView,
)

urlpatterns = [
    path("health/", HealthView.as_view()),
    path("leaderboard/", LeaderboardView.as_view()),
    path("friends/", PublicFriendsView.as_view()),
    path("me/results/", MyResultsView.as_view()),
    path("me/profile/", ProfileStatsView.as_view()),
    path("results/<int:pk>/", ResultDetailView.as_view()),
    path("admin/sessions/", AdminSessionListView.as_view()),
    path("admin/sessions/<int:pk>/", AdminSessionDetailView.as_view()),
    path("admin/bonuses/", AdminBonusListView.as_view()),
    path("admin/bonuses/<int:pk>/", AdminBonusDetailView.as_view()),
    path("admin/friends/", AdminFriendListView.as_view()),
    path("admin/friends/<int:pk>/", AdminFriendDetailView.as_view()),
]
