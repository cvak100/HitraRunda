from django.contrib import admin
from django.urls import include, path

from accounts.staff import AdminUserListView, AdminUserUpdateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/admin/users/", AdminUserListView.as_view()),
    path("api/admin/users/<int:pk>/", AdminUserUpdateView.as_view()),
    path("api/", include("questions.urls")),
    path("api/", include("rooms.urls")),
    path("api/", include("game.urls")),
]

admin.site.site_header = "Hitra runda"
admin.site.site_title = "Hitra runda"
admin.site.index_title = "Vsebina"
