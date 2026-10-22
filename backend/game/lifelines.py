import random

from game.bonus_models import PhoneFriend
from game.errors import GameError
from questions.models import Question

SINGLE_TYPES = {Question.Type.MULTIPLE_CHOICE, Question.Type.TRUE_FALSE}


def lifeline_options(game_question):
    question = game_question.question
    if question.question_type not in SINGLE_TYPES:
        return None
    options = list(question.options.all())
    if len(options) < 2:
        return None
    return options


def apply_fifty_fifty(game_question, state):
    options = lifeline_options(game_question)
    if options is None or len(options) < 4:
        raise GameError("Polovička je na voljo samo pri vprašanjih s štirimi možnostmi.")
    wrong = [option.id for option in options if not option.is_correct]
    if len(wrong) < 2:
        raise GameError("Polovičke ni mogoče uporabiti.")
    eliminated = random.sample(wrong, 2)
    state.setdefault("active_helps", {})["fifty_fifty"] = {
        "eliminated_option_ids": eliminated,
    }
    return {"effect": "fifty_fifty", "eliminated_option_ids": eliminated}


def apply_audience(game_question, state):
    options = lifeline_options(game_question)
    if options is None:
        raise GameError("Glas ljudstva je na voljo samo pri vprašanjih z eno pravilno možnostjo.")
    difficulty = min(5, max(1, game_question.question.difficulty))
    # Težja vprašanja → publika manj zanesljiva.
    correct_share = max(0.35, 0.82 - (difficulty - 1) * 0.1)
    remaining = 1.0 - correct_share
    wrong = [option for option in options if not option.is_correct]
    weights = []
    if wrong:
        raw = [random.random() for _ in wrong]
        total = sum(raw) or 1.0
        weights = [remaining * value / total for value in raw]
    votes = []
    wrong_index = 0
    for option in options:
        if option.is_correct:
            share = correct_share
        else:
            share = weights[wrong_index]
            wrong_index += 1
        votes.append({"option_id": option.id, "percent": round(share * 100)})
    # Popravi zaokroževanje na 100.
    drift = 100 - sum(item["percent"] for item in votes)
    if votes:
        votes[0]["percent"] += drift
    state.setdefault("active_helps", {})["audience"] = {"votes": votes}
    return {"effect": "audience", "votes": votes}


def apply_phone_friend(game_question, state, friend_key):
    options = lifeline_options(game_question)
    if options is None:
        raise GameError("Klic v sili je na voljo samo pri vprašanjih z eno pravilno možnostjo.")
    friend_keys = (state.get("lifelines") or {}).get("phone_friend", {}).get("friend_keys") or []
    if friend_key not in friend_keys:
        raise GameError("Tega prijatelja nisi izbral za to igro.")
    friend = PhoneFriend.objects.filter(key=friend_key, is_active=True).first()
    if friend is None:
        raise GameError("Prijatelj ne obstaja.")
    used = (state.get("lifelines") or {}).get("phone_friend", {}).get("used_friends") or []
    if friend_key in used:
        raise GameError("Tega prijatelja si že poklical.")

    question = game_question.question
    specialties = friend.specialty_categories or []
    in_specialty = not specialties or question.category.slug in specialties
    chance = friend.reliability if in_specialty else friend.out_of_specialty_reliability
    correct = next((option for option in options if option.is_correct), None)
    wrong = [option for option in options if not option.is_correct]
    if correct is None:
        raise GameError("Klica ni mogoče uporabiti.")

    if random.random() < chance:
        pick = correct
        if chance >= 0.85 and in_specialty:
            tone = "prepričan"
            line = f"Jaz bi šel na »{pick.text}«. Sem skoraj prepričan."
        elif in_specialty:
            tone = "misli"
            line = f"Mislim, da je »{pick.text}«."
        else:
            tone = "ugiba"
            line = f"Nisem v svojem elementu, ampak bi tipnil »{pick.text}«."
    else:
        pick = random.choice(wrong) if wrong else correct
        tone = "dvomi"
        line = f"Hmm… mogoče »{pick.text}«, ampak nisem prepričan."

    payload = {
        "effect": "phone_friend",
        "friend_key": friend.key,
        "friend_name": friend.name,
        "friend_title": friend.title,
        "option_id": pick.id,
        "option_text": pick.text,
        "tone": tone,
        "message": line,
        "in_specialty": in_specialty,
    }
    state.setdefault("active_helps", {})["phone_friend"] = payload
    phone = state.setdefault("lifelines", {}).setdefault("phone_friend", {})
    phone.setdefault("used_friends", []).append(friend.key)
    return payload


def initial_lifeline_state(friend_keys):
    return {
        "fifty_fifty": {"available": True, "used": False},
        "audience": {"available": True, "used": False},
        "phone_friend": {
            "available": True,
            "used": False,
            "friend_keys": list(friend_keys),
            "used_friends": [],
        },
    }


def mark_lifeline_used(state, effect_key):
    slot = state.setdefault("lifelines", {}).setdefault(effect_key, {})
    slot["available"] = False
    slot["used"] = True
