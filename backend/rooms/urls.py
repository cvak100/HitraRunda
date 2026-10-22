from django.urls import path

from rooms.views import RoomCreateView, RoomDetailView

urlpatterns = [
    path("rooms/", RoomCreateView.as_view()),
    path("rooms/<str:code>/", RoomDetailView.as_view()),
]
