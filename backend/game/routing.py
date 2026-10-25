from django.urls import path

from game.consumers import GameConsumer
from rooms.notify_consumer import NotifyConsumer

websocket_urlpatterns = [
    path("ws/game/<str:code>/", GameConsumer.as_asgi()),
    path("ws/notify/", NotifyConsumer.as_asgi()),
]
