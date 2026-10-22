from django.urls import path

from game.consumers import GameConsumer

websocket_urlpatterns = [
    path("ws/game/<str:code>/", GameConsumer.as_asgi()),
]
