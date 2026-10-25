from django.urls import path

from rooms.staff import AdminRoomCloseView, AdminRoomKickView, AdminRoomListView
from rooms.views import (
    MyInvitesView,
    PublicRoomListView,
    RoomCreateView,
    RoomDetailView,
    RoomInviteView,
    RoomJoinView,
    RoomKickView,
    RoomLeaveView,
    RoomQuickJoinView,
    RoomReadyView,
)

urlpatterns = [
    path("rooms/", RoomCreateView.as_view()),
    path("rooms/quick/", RoomQuickJoinView.as_view()),
    path("rooms/public/", PublicRoomListView.as_view()),
    path("rooms/invites/", MyInvitesView.as_view()),
    path("admin/rooms/", AdminRoomListView.as_view()),
    path("admin/rooms/<str:code>/close/", AdminRoomCloseView.as_view()),
    path("admin/rooms/<str:code>/kick/", AdminRoomKickView.as_view()),
    path("rooms/<str:code>/", RoomDetailView.as_view()),
    path("rooms/<str:code>/join/", RoomJoinView.as_view()),
    path("rooms/<str:code>/leave/", RoomLeaveView.as_view()),
    path("rooms/<str:code>/kick/", RoomKickView.as_view()),
    path("rooms/<str:code>/ready/", RoomReadyView.as_view()),
    path("rooms/<str:code>/invite/", RoomInviteView.as_view()),
]
