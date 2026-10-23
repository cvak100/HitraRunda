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
    use_lifeline,
    walk_away,
)
from game.modes import MODE_MULTIPLAYER
from game.multiplayer import claim_auto_advance, claim_bot_schedule
from rooms.services import (
    close_stale_rooms,
    invite_user,
    lobby_payload,
    refresh_can_start,
    set_ready,
    touch_room,
    update_room_settings,
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
        self.user = user
        self.code = code
        self.member_id = str(member_id)
        self.group = f"room_{code}"
        self.timer_task = None
        self.bot_tasks = []
        self.advance_task = None
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await database_sync_to_async(set_member_connected)(self.member_id, True)
        payload = await database_sync_to_async(snapshot)(self.member_id)
        await self.send_json(payload)
        if payload.get("phase") == "lobby":
            await self._broadcast_lobby()
        else:
            await self._arm(payload)
            await self._arm_bots(payload)

    async def disconnect(self, code):
        self._cancel_timer()
        if getattr(self, "group", None):
            await self.channel_layer.group_discard(self.group, self.channel_name)
        if getattr(self, "member_id", None):
            await database_sync_to_async(set_member_connected)(self.member_id, False)
            if getattr(self, "code", None):
                await self._broadcast_lobby()

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
            if kind == "lobby_sync":
                await self._broadcast_lobby()
                return
            if kind == "set_ready":
                await database_sync_to_async(set_ready)(self.user, self.code, bool(message.get("ready", True)))
                await self._broadcast_lobby()
                return
            if kind == "update_settings":
                await database_sync_to_async(update_room_settings)(self.user, self.code, message.get("settings") or message)
                await self._broadcast_lobby()
                return
            if kind == "invite":
                await database_sync_to_async(invite_user)(self.user, self.code, message)
                await self._broadcast_lobby()
                return
            if kind == "start_game":
                payloads = await database_sync_to_async(start_game)(self.member_id)
            elif kind == "submit_answer":
                payloads = await database_sync_to_async(submit_answer)(self.member_id, message)
            elif kind == "next_question":
                self._cancel_advance()
                payloads = await database_sync_to_async(next_question)(self.member_id)
            elif kind == "use_lifeline":
                payloads = await database_sync_to_async(use_lifeline)(self.member_id, message)
            elif kind == "walk_away":
                payloads = await database_sync_to_async(walk_away)(self.member_id)
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
        if payloads:
            first = payloads[0]
            if first.get("phase") == "question":
                await self._arm_bots(first)
            elif first.get("phase") == "round_review":
                await self._arm_auto_advance()

    async def game_event(self, event):
        payload = event["payload"]
        await self.send_json(payload)
        if payload.get("phase") == "question":
            self._cancel_advance()
            await self._arm(payload)
        elif payload.get("phase") == "answer_progress":
            # Drugi so odgovorili — ne prekini časovnika za tiste, ki še čakajo.
            pass
        elif payload.get("phase") in {"round_review", "waiting_answers", "lobby", "finished"}:
            self._cancel_timer()
            if payload.get("phase") in {"lobby", "finished"}:
                self._cancel_advance()
        else:
            self._cancel_timer()

    async def _broadcast_lobby(self):
        payload = await database_sync_to_async(self._lobby_payload)()
        await self.channel_layer.group_send(self.group, {"type": "game.event", "payload": payload})

    def _lobby_payload(self):
        from rooms.models import Room

        close_stale_rooms()
        room = Room.objects.filter(code=self.code).first()
        if room is None:
            return {"type": "error", "message": "Soba ne obstaja.", "phase": "error"}
        if room.status in {"closed", "finished"}:
            return {"type": "error", "message": "Soba je zaprta.", "phase": "error"}
        if (room.settings or {}).get("mode") != MODE_MULTIPLAYER:
            return {"type": "game_state", "phase": "waiting"}
        touch_room(room)
        payload = refresh_can_start(lobby_payload(room, viewer=None))
        payload["type"] = "lobby"
        payload["phase"] = "lobby"
        payload["mode"] = MODE_MULTIPLAYER
        return payload

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

    def _cancel_advance(self):
        task = getattr(self, "advance_task", None)
        current = asyncio.current_task()
        if task and task is not current and not task.done():
            task.cancel()
        if task is not current:
            self.advance_task = None

    async def _arm(self, payload):
        self._cancel_timer()
        if not payload or payload.get("phase") != "question":
            return
        game_question_id = (payload.get("question") or {}).get("game_question_id")
        if not game_question_id:
            return
        self.timer_task = asyncio.create_task(self._timeout_loop(game_question_id))

    async def _arm_bots(self, payload):
        if not payload or payload.get("phase") != "question":
            return
        if payload.get("mode") != MODE_MULTIPLAYER:
            return
        plans = await database_sync_to_async(claim_bot_schedule)(self.member_id)
        for plan in plans:
            task = asyncio.create_task(self._bot_answer_later(plan))
            self.bot_tasks.append(task)

    async def _bot_answer_later(self, plan):
        try:
            await asyncio.sleep(float(plan.get("delay") or 1))
            payloads = await database_sync_to_async(submit_answer)(plan["member_id"], plan["message"])
            await self._broadcast_all(payloads or [])
            if payloads:
                first = payloads[0]
                if first.get("phase") == "question":
                    await self._arm_bots(first)
                elif first.get("phase") == "round_review":
                    await self._arm_auto_advance()
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Bot odgovor ni uspel")

    async def _arm_auto_advance(self):
        plan = await database_sync_to_async(claim_auto_advance)(self.member_id)
        if not plan:
            return
        task = getattr(self, "advance_task", None)
        if task and not task.done():
            task.cancel()
        self.advance_task = asyncio.create_task(self._auto_advance_later(plan))

    async def _auto_advance_later(self, plan):
        try:
            await asyncio.sleep(float(plan.get("delay") or 5))
            payloads = await database_sync_to_async(next_question)(plan["host_member_id"])
            await self._broadcast_all(payloads or [])
            if payloads and payloads[0].get("phase") == "question":
                await self._arm_bots(payloads[0])
        except asyncio.CancelledError:
            return
        except GameError:
            return
        except Exception:
            logger.exception("Samodejni prehod runde ni uspel")

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
                if payloads and payloads[0].get("phase") == "round_review":
                    await self._arm_auto_advance()
                return
        except asyncio.CancelledError:
            return

    async def send_json(self, payload):
        await self.send(text_data=json.dumps(payload))
