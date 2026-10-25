"""Osebni WebSocket za takojšnja povabila (bell)."""

from channels.generic.websocket import AsyncJsonWebsocketConsumer


class NotifyConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if user is None or not getattr(user, "is_authenticated", False):
            await self.close()
            return
        self.user_id = user.id
        self.group = f"user_{self.user_id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        group = getattr(self, "group", None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Odjemalec lahko pošlje ping; ignoriramo ostalo.
        if isinstance(content, dict) and content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def user_invite(self, event):
        await self.send_json({"type": "invite", "invite": event.get("invite") or {}})
