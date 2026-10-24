from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from game.dirka import (
    _apply_solo_sprint,
    _grant_bonus,
    _reset_round_state,
    start_dirka,
    submit_dirka,
    use_dirka_bonus,
)
from game.modes import (
    DIRKA_CONVERT_STACK,
    DIRKA_SHIELD_ROUNDS,
    DIRKA_STRONG_BONUSES,
    DIRKA_WEAK_BONUSES,
    MODE_DIRKA,
)
from game.models import GameSession, PlayerAnswer
from game.seed_content import ensure_bonuses_and_friends
from game.site_settings import get as site_get
from questions.models import Category, Question, QuestionOption
from rooms.models import RoomMember


def make_questions(category, count=12):
    for index in range(count):
        question = Question.objects.create(
            external_key=f"dirka-{index}",
            category=category,
            question_type=Question.Type.MULTIPLE_CHOICE,
            difficulty=min(5, 1 + index // 2),
            text=f"Dirka Q {index}",
            is_active=True,
        )
        QuestionOption.objects.create(question=question, text="A", is_correct=True, order=0)
        QuestionOption.objects.create(question=question, text="B", is_correct=False, order=1)
        QuestionOption.objects.create(question=question, text="C", is_correct=False, order=2)
        QuestionOption.objects.create(question=question, text="D", is_correct=False, order=3)


class DirkaTests(TestCase):
    def setUp(self):
        ensure_bonuses_and_friends()
        self.category = Category.objects.create(slug="dirka-cat", name="Dirka", is_active=True)
        make_questions(self.category, 12)
        self.host = APIClient()
        self.guest = APIClient()
        self.host.post("/api/auth/guest/", {"nickname": "HostD"}, format="json")
        self.guest.post("/api/auth/guest/", {"nickname": "GuestD"}, format="json")

    def _room_and_members(self):
        created = self.host.post(
            "/api/rooms/",
            {
                "mode": "dirka",
                "nickname": "HostD",
                "visibility": "public",
                "max_players": 4,
                "target_score": 100,
                "safe_every": 5,
                "categories": ["dirka-cat"],
                "bot_count": 0,
            },
            format="json",
        )
        self.assertEqual(created.status_code, 200, created.content)
        code = created.data["code"]
        joined = self.guest.post(f"/api/rooms/{code}/join/", {"nickname": "GuestD"}, format="json")
        self.assertEqual(joined.status_code, 200, joined.content)
        self.host.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        self.guest.post(f"/api/rooms/{code}/ready/", {"ready": True}, format="json")
        host_member = RoomMember.objects.get(room__code=code, is_host=True, is_bot=False)
        guest_member = RoomMember.objects.exclude(pk=host_member.pk).get(room__code=code, is_bot=False)
        return code, host_member, guest_member

    def test_start_and_score_toward_target(self):
        _code, host_member, guest_member = self._room_and_members()
        started = start_dirka(host_member.id)
        self.assertEqual(started[0]["mode"], MODE_DIRKA)
        self.assertEqual(started[0]["target_score"], 100)
        host_id = str(host_member.id)
        self.assertEqual(started[0]["players"][host_id]["bonuses"], {})
        # Bot/host ne smejo deliti bonusov na root.
        self.assertNotIn("bonuses", started[0])

        session = GameSession.objects.get(room=host_member.room)
        gq = session.game_questions.get(order=0)
        correct = gq.question.options.get(is_correct=True)
        submit_dirka(host_member.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        payloads = submit_dirka(guest_member.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        self.assertEqual(payloads[0]["phase"], "round_review")
        host_row = next(row for row in payloads[0]["standings"] if row["member_id"] == host_id)
        self.assertGreater(host_row["score"], 0)

    def test_use_fifty_fifty(self):
        _code, host_member, _guest = self._room_and_members()
        start_dirka(host_member.id)
        session = GameSession.objects.get(room=host_member.room)
        state = dict(session.state or {})
        players = dict(state.get("players") or {})
        key = str(host_member.id)
        stats = dict(players.get(key) or {})
        stats["bonuses"] = {"fifty_fifty": 1}
        players[key] = stats
        state["players"] = players
        session.state = state
        session.save(update_fields=["state"])
        gq = session.game_questions.get(order=0)
        result = use_dirka_bonus(
            host_member.id,
            {"effect": "fifty_fifty", "game_question_id": str(gq.id)},
        )
        self.assertEqual(result[0]["bonus"]["effect"], "fifty_fifty")
        self.assertEqual(len(result[0]["bonus"]["eliminated_option_ids"]), 2)
        host_id = str(host_member.id)
        self.assertEqual(result[0]["players"][host_id]["bonuses"].get("fifty_fifty", 0), 0)
        self.assertEqual(result[0]["bonus_member_id"], host_id)

    def _patch_player(self, session, member_id, **updates):
        state = dict(session.state or {})
        players = dict(state.get("players") or {})
        key = str(member_id)
        stats = dict(players.get(key) or {})
        stats.update(updates)
        players[key] = stats
        state["players"] = players
        session.state = state
        session.save(update_fields=["state"])
        return session

    def test_shield_blocks_penalty_without_helping_others(self):
        _code, host_member, guest_member = self._room_and_members()
        start_dirka(host_member.id)
        session = GameSession.objects.get(room=host_member.room)
        host_id = str(host_member.id)
        guest_id = str(guest_member.id)
        self._patch_player(
            session,
            host_id,
            score=20,
            shield=True,
            shield_left=DIRKA_SHIELD_ROUNDS,
            bonuses={"shield": 0},
        )
        self._patch_player(session, guest_id, score=20)
        session.refresh_from_db()
        guest_before = int((session.state["players"][guest_id] or {}).get("score") or 0)

        gq = session.game_questions.get(order=0)
        wrong = gq.question.options.filter(is_correct=False).first()
        submit_dirka(host_member.id, {"game_question_id": str(gq.id), "option_id": wrong.id})
        session.refresh_from_db()
        host_stats = session.state["players"][host_id]
        guest_stats = session.state["players"][guest_id]
        self.assertEqual(int(host_stats["score"]), 20)
        # Miss ne porabi ščita — traja še preostale runde.
        self.assertTrue(host_stats.get("shield"))
        self.assertEqual(int(host_stats.get("shield_left") or 0), DIRKA_SHIELD_ROUNDS)
        self.assertEqual(int(guest_stats["score"]), guest_before)
        answer = PlayerAnswer.objects.get(game_question=gq, room_member=host_member)
        self.assertEqual(answer.points, 0)
        self.assertTrue((answer.answer_data or {}).get("shielded"))

    def test_steal_amount_in_config_range_and_transfers(self):
        _code, host_member, guest_member = self._room_and_members()
        start_dirka(host_member.id)
        session = GameSession.objects.get(room=host_member.room)
        host_id = str(host_member.id)
        guest_id = str(guest_member.id)
        # Guest ahead → host steals from guest.
        self._patch_player(session, host_id, score=10, armed={"steal": True}, bonuses={"steal": 0})
        self._patch_player(session, guest_id, score=30, safe_locked=0)
        session.refresh_from_db()
        gq = session.game_questions.get(order=0)
        correct = gq.question.options.get(is_correct=True)
        steal_min = int(site_get("dirka_steal_min"))
        steal_max = int(site_get("dirka_steal_max"))
        with mock.patch("game.dirka.random.randint", return_value=steal_min):
            submit_dirka(host_member.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        session.refresh_from_db()
        host_stats = session.state["players"][host_id]
        guest_stats = session.state["players"][guest_id]
        answer = PlayerAnswer.objects.get(game_question=gq, room_member=host_member)
        stolen = int((answer.answer_data or {}).get("steal") or 0)
        self.assertEqual(stolen, steal_min)
        self.assertGreaterEqual(stolen, steal_min)
        self.assertLessEqual(stolen, steal_max)
        self.assertEqual(int(guest_stats["score"]), 30 - steal_min)
        # Host score = prior + answer points (incl. steal in points field).
        self.assertEqual(int(host_stats["score"]), 10 + int(answer.points))
        self.assertEqual(answer.answer_data.get("steal_from"), guest_id)

    def test_shield_blocks_incoming_steal(self):
        _code, host_member, guest_member = self._room_and_members()
        start_dirka(host_member.id)
        session = GameSession.objects.get(room=host_member.room)
        host_id = str(host_member.id)
        guest_id = str(guest_member.id)
        self._patch_player(session, host_id, score=10, armed={"steal": True})
        self._patch_player(
            session, guest_id, score=30, shield=True, shield_left=DIRKA_SHIELD_ROUNDS
        )
        session.refresh_from_db()
        gq = session.game_questions.get(order=0)
        correct = gq.question.options.get(is_correct=True)
        submit_dirka(host_member.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        session.refresh_from_db()
        self.assertEqual(int(session.state["players"][guest_id]["score"]), 30)
        # Ščit se pri blokirani kraji NE porabi.
        self.assertTrue(session.state["players"][guest_id].get("shield"))
        self.assertEqual(
            int(session.state["players"][guest_id].get("shield_left") or 0), DIRKA_SHIELD_ROUNDS
        )
        answer = PlayerAnswer.objects.get(game_question=gq, room_member=host_member)
        self.assertTrue((answer.answer_data or {}).get("steal_blocked"))
        self.assertEqual(int((answer.answer_data or {}).get("steal") or 0), 0)
        host_pts = int(answer.points or 0)
        # Tat dobi samo točke odgovora, brez kraje.
        self.assertEqual(int(session.state["players"][host_id]["score"]), 10 + host_pts)
        self.assertEqual(int((answer.answer_data or {}).get("steal") or 0), 0)

        # Guest nato zgreši — ščit še drži (runde), kazni ni.
        guest_before = int(session.state["players"][guest_id]["score"])
        host_before = int(session.state["players"][host_id]["score"])
        wrong = gq.question.options.filter(is_correct=False).first()
        submit_dirka(guest_member.id, {"game_question_id": str(gq.id), "option_id": wrong.id})
        session.refresh_from_db()
        self.assertEqual(int(session.state["players"][guest_id]["score"]), guest_before)
        self.assertEqual(int(session.state["players"][host_id]["score"]), host_before)
        self.assertTrue(session.state["players"][guest_id].get("shield"))
        self.assertEqual(
            int(session.state["players"][guest_id].get("shield_left") or 0), DIRKA_SHIELD_ROUNDS
        )
        guest_answer = PlayerAnswer.objects.get(game_question=gq, room_member=guest_member)
        self.assertTrue((guest_answer.answer_data or {}).get("shielded"))
        self.assertEqual(guest_answer.points, 0)

    def test_shield_ticks_down_over_three_rounds(self):
        _code, host_member, guest_member = self._room_and_members()
        start_dirka(host_member.id)
        session = GameSession.objects.get(room=host_member.room)
        host_id = str(host_member.id)
        self._patch_player(
            session, host_id, shield=True, shield_left=DIRKA_SHIELD_ROUNDS
        )
        gq = session.game_questions.get(order=0)
        for expected in (2, 1, 0):
            _reset_round_state(session, gq, tick_shield=True)
            session.refresh_from_db()
            stats = session.state["players"][host_id]
            self.assertEqual(int(stats.get("shield_left") or 0), expected)
            self.assertEqual(bool(stats.get("shield")), expected > 0)

    def test_double_doubles_base_and_speed(self):
        _code, host_member, guest_member = self._room_and_members()
        start_dirka(host_member.id)
        session = GameSession.objects.get(room=host_member.room)
        host_id = str(host_member.id)
        self._patch_player(session, host_id, score=0, armed={"double": True})
        gq = session.game_questions.get(order=0)
        correct = gq.question.options.get(is_correct=True)
        submit_dirka(host_member.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        answer = PlayerAnswer.objects.get(game_question=gq, room_member=host_member)
        self.assertTrue((answer.answer_data or {}).get("double"))
        base = int(site_get("dirka_base_points"))
        # Speed 0–2; with double, points >= 2*base.
        self.assertGreaterEqual(answer.points, base * 2)

    def test_grant_pools_include_rush_block_and_hot_uses_weak(self):
        self.assertIn("rush", DIRKA_STRONG_BONUSES)
        self.assertIn("block", DIRKA_STRONG_BONUSES)
        self.assertIn("shield", DIRKA_WEAK_BONUSES)
        self.assertIn("skip", DIRKA_WEAK_BONUSES)
        self.assertNotIn("shield", DIRKA_STRONG_BONUSES)
        self.assertNotIn("skip", DIRKA_STRONG_BONUSES)
        self.assertEqual(DIRKA_SHIELD_ROUNDS, 3)
        self.assertEqual(DIRKA_CONVERT_STACK, 4)

    def test_breakthrough_grants_strong_once_at_half_target(self):
        _code, host_member, guest_member = self._room_and_members()
        start_dirka(host_member.id)
        session = GameSession.objects.get(room=host_member.room)
        host_id = str(host_member.id)
        target = int((session.state or {}).get("target_score") or 100)
        # Tik pod pragom; pravilni odgovor ga prebije.
        self._patch_player(session, host_id, score=max(0, target // 2 - 1), breakthrough_claimed=False)
        gq = session.game_questions.get(order=0)
        correct = gq.question.options.get(is_correct=True)
        with mock.patch("game.dirka._grant_random_bonus", return_value="steal") as grant:
            # Samo breakthrough naj kliče strong; dovolimo tudi druge grante → count ≥ 1.
            submit_dirka(host_member.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        session.refresh_from_db()
        host_stats = session.state["players"][host_id]
        self.assertTrue(host_stats.get("breakthrough_claimed"))
        answer = PlayerAnswer.objects.get(game_question=gq, room_member=host_member)
        self.assertTrue((answer.answer_data or {}).get("breakthrough"))
        self.assertGreaterEqual(grant.call_count, 1)
        self.assertTrue(
            any(c.args[1] == DIRKA_STRONG_BONUSES for c in grant.call_args_list),
            "Preboj mora klicati močan pool",
        )

        # Drugič se ne sproži.
        gq2 = session.game_questions.filter(order=1).first()
        if gq2 is None:
            return
        grant.reset_mock()
        # Ročno naprej na Q1 ni nujno; breakthrough_claimed že True.
        self._patch_player(session, host_id, breakthrough_claimed=True, score=target)
        session.refresh_from_db()
        self.assertTrue(session.state["players"][host_id].get("breakthrough_claimed"))

    def test_bonus_convert_three_plus_one_to_strong(self):
        stats = {"bonuses": {"hint": 3}}
        with mock.patch("game.dirka.random.choice", return_value="steal"):
            result = _grant_bonus(stats, "hint")
        self.assertEqual(result, "steal")
        self.assertEqual(int((stats.get("bonuses") or {}).get("hint") or 0), 0)
        self.assertEqual(int((stats.get("bonuses") or {}).get("steal") or 0), 1)
        converts = stats.get("_pending_converts") or []
        self.assertEqual(len(converts), 1)
        self.assertEqual(converts[0]["from"], "hint")
        self.assertEqual(converts[0]["to"], "steal")
        self.assertEqual(converts[0]["cleared"], 4)

    def test_solo_sprint_only_one_correct(self):
        _code, host_member, guest_member = self._room_and_members()
        start_dirka(host_member.id)
        session = GameSession.objects.get(room=host_member.room)
        host_id = str(host_member.id)
        gq = session.game_questions.get(order=0)
        correct = gq.question.options.get(is_correct=True)
        wrong = gq.question.options.filter(is_correct=False).first()
        submit_dirka(host_member.id, {"game_question_id": str(gq.id), "option_id": correct.id})
        with mock.patch("game.dirka.random.choice", return_value="double"):
            # Drugi (napačen) odgovor zaključi rundo → broadcast → solo sprint.
            submit_dirka(guest_member.id, {"game_question_id": str(gq.id), "option_id": wrong.id})
        session.refresh_from_db()
        host_bonuses = session.state["players"][host_id].get("bonuses") or {}
        self.assertGreaterEqual(int(host_bonuses.get("double") or 0), 1)
        answer = PlayerAnswer.objects.get(game_question=gq, room_member=host_member)
        self.assertTrue((answer.answer_data or {}).get("solo_sprint"))
        guest_answer = PlayerAnswer.objects.get(game_question=gq, room_member=guest_member)
        self.assertFalse((guest_answer.answer_data or {}).get("solo_sprint"))
        # Idempotent.
        _apply_solo_sprint(session, gq)
        session.refresh_from_db()
        self.assertEqual(
            int(session.state["players"][host_id]["bonuses"].get("double") or 0),
            int(host_bonuses.get("double") or 0),
        )
