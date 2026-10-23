from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.staff import StaffOnly
from game.bonus_models import AiBot
from game.engine import GameError
from game.seed_content import ensure_bots
from game.simulate import simulate_match
from game.site_settings import get_int_set
from questions.models import Category


class AdminSimulateMatchView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        ensure_bots()
        cats = list(Category.objects.filter(is_active=True).order_by("name"))
        bots = list(AiBot.objects.filter(is_active=True).order_by("order", "name"))
        cat_slugs = [c.slug for c in cats]
        mp_bots = [b.key for b in bots if "multiplayer" in (b.modes or [])]
        all_bot_keys = [b.key for b in bots]
        return Response(
            {
                "modes": [
                    {"key": "hitrarunda", "label": "Hitra runda"},
                    {"key": "ala_milijonar", "label": "Ala milijonar"},
                    {"key": "multiplayer", "label": "Hitra tekma"},
                    {"key": "dirka", "label": "Dirka"},
                    {"key": "60_sekund", "label": "60 sekund"},
                ],
                "categories": [{"slug": c.slug, "name": c.name} for c in cats],
                "bots": [
                    {
                        "key": b.key,
                        "name": b.name,
                        "color": b.color,
                        "avatar": b.avatar or "",
                        "accuracy": b.accuracy,
                        "modes": list(b.modes or []),
                    }
                    for b in bots
                ],
                "options": {
                    "bot_counts": list(range(2, 9)),
                    "question_counts": sorted(get_int_set("mp_question_counts") or [5, 10, 20, 40]),
                    "hr_question_counts": list(range(5, 16)),
                    "time_limits": sorted(get_int_set("mp_allowed_times") or [30, 60, 90, 120]),
                    "hr_time_limits": sorted(get_int_set("hr_allowed_times") or [10, 15, 20, 30, 45, 60]),
                    "targets": sorted(get_int_set("dirka_target_scores") or [100, 200, 500, 1000]),
                    "safe_every": sorted(get_int_set("dirka_safe_every") or [5, 10]),
                },
                "defaults": {
                    "mode": "multiplayer",
                    "bot_count": min(3, max(2, len(mp_bots) or 3)),
                    "question_count": 10,
                    "time_limit_seconds": 30,
                    "target_score": 200,
                    "safe_every": 5,
                    "sudden_death": False,
                    "count_for_leaderboard": True,
                    "categories": cat_slugs,
                    "bot_keys": mp_bots or all_bot_keys,
                },
            }
        )

    def post(self, request):
        try:
            result = simulate_match(request.user, request.data if isinstance(request.data, dict) else {})
        except GameError as exc:
            return Response({"detail": exc.message}, status=400)
        except Exception as exc:
            return Response({"detail": f"Simulacija ni uspela: {exc}"}, status=500)
        return Response(result)
