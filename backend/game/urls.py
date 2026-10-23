from django.urls import path

from game.staff_content import (
    AdminBonusDetailView,
    AdminBonusListView,
    AdminBotDetailView,
    AdminBotListView,
    AdminFriendDetailView,
    AdminFriendListView,
    PublicFriendsView,
)
from game.admin_health import AdminHealthView
from game.admin_site_settings import (
    AdminSiteSettingsResetView,
    AdminSiteSettingsView,
    PublicGameConfigView,
)
from game.admin_simulate import AdminSimulateMatchView
from game.admin_tests import AdminTestCatalogView, AdminTestRunView
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
    path("game-config/", PublicGameConfigView.as_view()),
    path("me/results/", MyResultsView.as_view()),
    path("me/profile/", ProfileStatsView.as_view()),
    path("results/<int:pk>/", ResultDetailView.as_view()),
    path("admin/sessions/", AdminSessionListView.as_view()),
    path("admin/sessions/<int:pk>/", AdminSessionDetailView.as_view()),
    path("admin/settings/", AdminSiteSettingsView.as_view()),
    path("admin/settings/reset/", AdminSiteSettingsResetView.as_view()),
    path("admin/health/", AdminHealthView.as_view()),
    path("admin/tests/", AdminTestCatalogView.as_view()),
    path("admin/tests/run/", AdminTestRunView.as_view()),
    path("admin/simulate/", AdminSimulateMatchView.as_view()),
    path("admin/bonuses/", AdminBonusListView.as_view()),
    path("admin/bonuses/<int:pk>/", AdminBonusDetailView.as_view()),
    path("admin/friends/", AdminFriendListView.as_view()),
    path("admin/friends/<int:pk>/", AdminFriendDetailView.as_view()),
    path("admin/bots/", AdminBotListView.as_view()),
    path("admin/bots/<int:pk>/", AdminBotDetailView.as_view()),
]
