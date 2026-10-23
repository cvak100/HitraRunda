from django.urls import path

from rooms.staff import AdminRoomCloseView, AdminRoomListView
from rooms.views import (
    MyInvitesView,
    PublicRoomListView,
    RoomCreateView,
    RoomDetailView,
    RoomInviteView,
    RoomJoinView,
    RoomReadyView,
)

urlpatterns = [
    path("rooms/", RoomCreateView.as_view()),
    path("rooms/public/", PublicRoomListView.as_view()),
    path("rooms/invites/", MyInvitesView.as_view()),
    path("admin/rooms/", AdminRoomListView.as_view()),
    path("admin/rooms/<str:code>/close/", AdminRoomCloseView.as_view()),
    path("rooms/<str:code>/", RoomDetailView.as_view()),
    path("rooms/<str:code>/join/", RoomJoinView.as_view()),
    path("rooms/<str:code>/ready/", RoomReadyView.as_view()),
    path("rooms/<str:code>/invite/", RoomInviteView.as_view()),
]
