from django.contrib import admin
from django.urls import include, path

from accounts.staff import AdminCleanupGuestsView, AdminUserListView, AdminUserUpdateView
from rooms.staff import AdminCloseLiveRoomsView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/admin/users/", AdminUserListView.as_view()),
    path("api/admin/users/<int:pk>/", AdminUserUpdateView.as_view()),
    path("api/admin/actions/cleanup-guests/", AdminCleanupGuestsView.as_view()),
    path("api/admin/actions/close-live-rooms/", AdminCloseLiveRoomsView.as_view()),
    path("api/", include("questions.urls")),
    path("api/", include("rooms.urls")),
    path("api/", include("game.urls")),
    path("api/", include("geo.urls")),
]

admin.site.site_header = "Hitra runda"
admin.site.site_title = "Hitra runda"
admin.site.index_title = "Vsebina"
