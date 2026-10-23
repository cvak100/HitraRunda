from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.staff import StaffOnly
from game.bonus_models import AiBot, BonusDefinition, PhoneFriend
from game.modes import MODE_LABELS, PLAYABLE_MODES
from game.seed_content import ensure_bonuses_and_friends, ensure_bots


def bonus_payload(bonus):
    return {
        "id": bonus.id,
        "key": bonus.key,
        "name": bonus.name,
        "description": bonus.description,
        "bonus_kind": bonus.bonus_kind,
        "effect_key": bonus.effect_key,
        "modes": bonus.modes or [],
        "config": bonus.config or {},
        "is_active": bonus.is_active,
        "order": bonus.order,
    }


def friend_payload(friend):
    return {
        "id": friend.id,
        "key": friend.key,
        "name": friend.name,
        "title": friend.title,
        "bio": friend.bio,
        "specialty_categories": friend.specialty_categories or [],
        "reliability": friend.reliability,
        "out_of_specialty_reliability": friend.out_of_specialty_reliability,
        "avatar_color": friend.avatar_color,
        "is_active": friend.is_active,
        "order": friend.order,
    }


class PublicFriendsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        ensure_bonuses_and_friends()
        friends = PhoneFriend.objects.filter(is_active=True).order_by("order", "name")
        return Response({"friends": [friend_payload(friend) for friend in friends], "pick": 3})


class AdminBonusListView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        ensure_bonuses_and_friends()
        bonuses = BonusDefinition.objects.order_by("order", "name")
        return Response(
            {
                "bonuses": [bonus_payload(bonus) for bonus in bonuses],
                "modes": [{"key": key, "label": MODE_LABELS[key]} for key in sorted(PLAYABLE_MODES)],
                "kinds": [{"key": key, "label": label} for key, label in BonusDefinition.Kind.choices],
            }
        )

    def post(self, request):
        return self._save(None, request.data)


    def _save(self, bonus, data):
        key = str(data.get("key") or (bonus.key if bonus else "")).strip()
        name = str(data.get("name") or "").strip()
        if not key or not name:
            return Response({"detail": "Ključ in ime sta obvezna."}, status=400)
        effect_key = str(data.get("effect_key") or key).strip()
        bonus_kind = data.get("bonus_kind") or BonusDefinition.Kind.LIFELINE
        if bonus_kind not in BonusDefinition.Kind.values:
            return Response({"detail": "Neznana vrsta bonusa."}, status=400)
        modes = data.get("modes") if isinstance(data.get("modes"), list) else []
        modes = [str(item).strip() for item in modes if str(item).strip()]
        config = data.get("config") if isinstance(data.get("config"), dict) else {}
        try:
            order = int(data.get("order", bonus.order if bonus else 0))
        except (TypeError, ValueError):
            return Response({"detail": "Vrstni red mora biti število."}, status=400)
        is_active = data.get("is_active", True)
        if not isinstance(is_active, bool):
            return Response({"detail": "is_active mora biti true/false."}, status=400)
        defaults = {
            "name": name,
            "description": str(data.get("description") or "").strip(),
            "bonus_kind": bonus_kind,
            "effect_key": effect_key,
            "modes": modes,
            "config": config,
            "is_active": is_active,
            "order": order,
        }
        if bonus is None:
            if BonusDefinition.objects.filter(key=key).exists():
                return Response({"detail": "Ključ že obstaja."}, status=400)
            bonus = BonusDefinition.objects.create(key=key, **defaults)
        else:
            if key != bonus.key and BonusDefinition.objects.filter(key=key).exists():
                return Response({"detail": "Ključ že obstaja."}, status=400)
            bonus.key = key
            for field, value in defaults.items():
                setattr(bonus, field, value)
            bonus.save()
        return Response({"bonus": bonus_payload(bonus)})


class AdminBonusDetailView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request, pk):
        bonus = get_object_or_404(BonusDefinition, pk=pk)
        return AdminBonusListView()._save(bonus, request.data)

    def delete(self, request, pk):
        bonus = get_object_or_404(BonusDefinition, pk=pk)
        bonus.is_active = False
        bonus.save(update_fields=["is_active"])
        return Response({"detail": "Bonus je umaknjen.", "bonus": bonus_payload(bonus)})


class AdminFriendListView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        ensure_bonuses_and_friends()
        friends = PhoneFriend.objects.order_by("order", "name")
        return Response({"friends": [friend_payload(friend) for friend in friends]})

    def post(self, request):
        return self._save(None, request.data)

    def _save(self, friend, data):
        key = str(data.get("key") or (friend.key if friend else "")).strip()
        name = str(data.get("name") or "").strip()
        title = str(data.get("title") or "").strip()
        if not key or not name or not title:
            return Response({"detail": "Ključ, ime in naziv so obvezni."}, status=400)
        specialties = data.get("specialty_categories") if isinstance(data.get("specialty_categories"), list) else []
        specialties = [str(item).strip() for item in specialties if str(item).strip()]
        try:
            reliability = float(data.get("reliability", friend.reliability if friend else 0.7))
            out_rel = float(
                data.get(
                    "out_of_specialty_reliability",
                    friend.out_of_specialty_reliability if friend else 0.35,
                )
            )
            order = int(data.get("order", friend.order if friend else 0))
        except (TypeError, ValueError):
            return Response({"detail": "Številčne vrednosti niso veljavne."}, status=400)
        if not 0 <= reliability <= 1 or not 0 <= out_rel <= 1:
            return Response({"detail": "Zanesljivost je med 0 in 1."}, status=400)
        is_active = data.get("is_active", True)
        if not isinstance(is_active, bool):
            return Response({"detail": "is_active mora biti true/false."}, status=400)
        defaults = {
            "name": name,
            "title": title,
            "bio": str(data.get("bio") or "").strip(),
            "specialty_categories": specialties,
            "reliability": reliability,
            "out_of_specialty_reliability": out_rel,
            "avatar_color": str(data.get("avatar_color") or "#e6b325").strip()[:20],
            "is_active": is_active,
            "order": order,
        }
        if friend is None:
            if PhoneFriend.objects.filter(key=key).exists():
                return Response({"detail": "Ključ že obstaja."}, status=400)
            friend = PhoneFriend.objects.create(key=key, **defaults)
        else:
            if key != friend.key and PhoneFriend.objects.filter(key=key).exists():
                return Response({"detail": "Ključ že obstaja."}, status=400)
            friend.key = key
            for field, value in defaults.items():
                setattr(friend, field, value)
            friend.save()
        return Response({"friend": friend_payload(friend)})


class AdminFriendDetailView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request, pk):
        friend = get_object_or_404(PhoneFriend, pk=pk)
        return AdminFriendListView()._save(friend, request.data)

    def delete(self, request, pk):
        friend = get_object_or_404(PhoneFriend, pk=pk)
        friend.is_active = False
        friend.save(update_fields=["is_active"])
        return Response({"detail": "Prijatelj je umaknjen.", "friend": friend_payload(friend)})


BOT_MODE_CHOICES = ("multiplayer", "dirka")


def bot_payload(bot):
    return {
        "id": bot.id,
        "key": bot.key,
        "name": bot.name,
        "color": bot.color,
        "accuracy": bot.accuracy,
        "delay_min": bot.delay_min,
        "delay_max": bot.delay_max,
        "modes": list(bot.modes or []),
        "is_active": bot.is_active,
        "count_for_leaderboard": bot.count_for_leaderboard,
        "order": bot.order,
    }


class AdminBotListView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        ensure_bots()
        bots = AiBot.objects.order_by("order", "name")
        return Response({"bots": [bot_payload(bot) for bot in bots]})

    def post(self, request):
        return self._save(None, request.data)

    def _save(self, bot, data):
        key = str(data.get("key") or (bot.key if bot else "")).strip()
        name = str(data.get("name") or "").strip()
        if not key or not name:
            return Response({"detail": "Ključ in ime sta obvezna."}, status=400)
        try:
            accuracy = float(data.get("accuracy", bot.accuracy if bot else 0.72))
            delay_min = float(data.get("delay_min", bot.delay_min if bot else 1.2))
            delay_max = float(data.get("delay_max", bot.delay_max if bot else 7.5))
            order = int(data.get("order", bot.order if bot else 0))
        except (TypeError, ValueError):
            return Response({"detail": "Številčne vrednosti niso veljavne."}, status=400)
        if not 0 <= accuracy <= 1:
            return Response({"detail": "Natančnost je med 0 in 1."}, status=400)
        if delay_min < 0.2 or delay_max < delay_min:
            return Response({"detail": "Zakasnitev ni veljavna."}, status=400)
        is_active = data.get("is_active", True)
        if not isinstance(is_active, bool):
            return Response({"detail": "is_active mora biti true/false."}, status=400)
        count_for_leaderboard = data.get(
            "count_for_leaderboard",
            bot.count_for_leaderboard if bot else False,
        )
        if not isinstance(count_for_leaderboard, bool):
            return Response({"detail": "count_for_leaderboard mora biti true/false."}, status=400)
        raw_modes = data.get("modes", bot.modes if bot else ["multiplayer"])
        if not isinstance(raw_modes, list):
            return Response({"detail": "modes mora biti seznam."}, status=400)
        modes = []
        for item in raw_modes:
            key_mode = str(item or "").strip()
            if key_mode in BOT_MODE_CHOICES and key_mode not in modes:
                modes.append(key_mode)
        if not modes:
            return Response({"detail": "Izberi vsaj en način (Hitra tekma ali Dirka)."}, status=400)
        defaults = {
            "name": name[:30],
            "color": str(data.get("color") or "#7dcea0").strip()[:20],
            "accuracy": accuracy,
            "delay_min": delay_min,
            "delay_max": delay_max,
            "modes": modes,
            "is_active": is_active,
            "count_for_leaderboard": count_for_leaderboard,
            "order": order,
        }
        if bot is None:
            if AiBot.objects.filter(key=key).exists():
                return Response({"detail": "Ključ že obstaja."}, status=400)
            bot = AiBot.objects.create(key=key, **defaults)
        else:
            if key != bot.key and AiBot.objects.filter(key=key).exists():
                return Response({"detail": "Ključ že obstaja."}, status=400)
            bot.key = key
            for field, value in defaults.items():
                setattr(bot, field, value)
            bot.save()
        return Response({"bot": bot_payload(bot)})


class AdminBotDetailView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request, pk):
        bot = get_object_or_404(AiBot, pk=pk)
        return AdminBotListView()._save(bot, request.data)

    def delete(self, request, pk):
        bot = get_object_or_404(AiBot, pk=pk)
        bot.is_active = False
        bot.save(update_fields=["is_active"])
        return Response({"detail": "Bot je umaknjen.", "bot": bot_payload(bot)})
