import asyncio
import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from game.engine import (
    GameError,
    apply_timeout,
    member_id_for,
    next_question,
    seconds_until_hard_end,
    set_member_connected,
    snapshot,
    start_game,
    submit_answer,
)

logger = logging.getLogger(__name__)


class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return
        code = self.scope["url_route"]["kwargs"]["code"]
        member_id = await database_sync_to_async(member_id_for)(user.id, code)
        if member_id is None:
            await self.close(code=4403)
            return
        self.member_id = str(member_id)
        self.group = f"room_{code}"
        self.timer_task = None
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await database_sync_to_async(set_member_connected)(self.member_id, True)
        payload = await database_sync_to_async(snapshot)(self.member_id)
        await self.send_json(payload)
        await self._arm(payload)

    async def disconnect(self, code):
        self._cancel_timer()
        if getattr(self, "group", None):
            await self.channel_layer.group_discard(self.group, self.channel_name)
        if getattr(self, "member_id", None):
            await database_sync_to_async(set_member_connected)(self.member_id, False)

    async def receive(self, text_data=None, bytes_data=None):
        try:
            message = json.loads(text_data or "{}")
        except json.JSONDecodeError:
            await self.send_json({"type": "error", "message": "Neveljavno sporočilo."})
            return
        if not isinstance(message, dict):
            await self.send_json({"type": "error", "message": "Neveljavno sporočilo."})
            return
        kind = message.get("type")
        try:
            if kind == "start_game":
                payloads = await database_sync_to_async(start_game)(self.member_id)
            elif kind == "submit_answer":
                payloads = await database_sync_to_async(submit_answer)(self.member_id, message)
            elif kind == "next_question":
                payloads = await database_sync_to_async(next_question)(self.member_id)
            else:
                await self.send_json({"type": "error", "message": "Neznan dogodek."})
                return
        except GameError as exc:
            await self.send_json({"type": "error", "message": exc.message})
            return
        except Exception:
            logger.exception("Napaka v igri")
            await self.send_json({"type": "error", "message": "Na strežniku je prišlo do napake."})
            return
        await self._broadcast_all(payloads or [])

    async def game_event(self, event):
        payload = event["payload"]
        await self.send_json(payload)
        if payload.get("phase") == "question":
            await self._arm(payload)
        else:
            self._cancel_timer()

    async def _broadcast_all(self, payloads):
        for payload in payloads:
            await self.channel_layer.group_send(
                self.group,
                {"type": "game.event", "payload": payload},
            )

    def _cancel_timer(self):
        task = getattr(self, "timer_task", None)
        current = asyncio.current_task()
        if task and task is not current and not task.done():
            task.cancel()
        if task is not current:
            self.timer_task = None

    async def _arm(self, payload):
        self._cancel_timer()
        if not payload or payload.get("phase") != "question":
            return
        game_question_id = (payload.get("question") or {}).get("game_question_id")
        if not game_question_id:
            return
        self.timer_task = asyncio.create_task(self._timeout_loop(game_question_id))

    async def _timeout_loop(self, game_question_id):
        try:
            while True:
                delay = await database_sync_to_async(seconds_until_hard_end)(game_question_id)
                if delay is None:
                    return
                if delay > 0:
                    await asyncio.sleep(delay)
                    continue
                payloads = await database_sync_to_async(apply_timeout)(self.member_id, game_question_id)
                await self._broadcast_all(payloads or [])
                return
        except asyncio.CancelledError:
            return

    async def send_json(self, payload):
        await self.send(text_data=json.dumps(payload))
