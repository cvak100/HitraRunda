import random
import secrets

from questions.models import Question


def ensure_presentation(game_question):
    """Zamrzne prikaz + ocenjevanje (tekst, opcije, correct) za replay/grade."""
    existing = game_question.presentation or {}
    if existing.get("v") == 2 and existing.get("text") is not None:
        return existing

    question = game_question.question
    options = list(question.options.all())

    # Ohrani že izračunan vrstni red / matching, če obstaja (stare seje).
    if existing.get("option_ids"):
        option_ids = list(existing["option_ids"])
    elif question.question_type in {
        Question.Type.MULTIPLE_CHOICE,
        Question.Type.TRUE_FALSE,
        Question.Type.MULTI_SELECT,
        Question.Type.ORDERING,
    }:
        option_ids = [option.id for option in options]
        random.shuffle(option_ids)
    else:
        option_ids = []

    presentation = {
        "v": 2,
        "text": question.text,
        "question_type": question.question_type,
        "difficulty": question.difficulty,
        "category": question.category.slug,
        "category_name": question.category.name,
        "image": question.image or None,
        "explanation": question.explanation or "",
        "options": [
            {
                "id": option.id,
                "text": option.text,
                "is_correct": bool(option.is_correct),
                "order": option.order,
            }
            for option in options
        ],
        "config": dict(question.config or {}),
    }
    if option_ids:
        presentation["option_ids"] = option_ids

    if question.question_type == Question.Type.MATCHING:
        if existing.get("left") and existing.get("links"):
            presentation["left"] = existing["left"]
            presentation["right"] = existing["right"]
            presentation["links"] = existing["links"]
        else:
            left = []
            right = []
            links = []
            for pair in (question.config or {}).get("pairs", []):
                left_id = secrets.token_hex(4)
                right_id = secrets.token_hex(4)
                left.append({"id": left_id, "text": pair["left"]})
                right.append({"id": right_id, "text": pair["right"]})
                links.append(
                    {
                        "left_id": left_id,
                        "right_id": right_id,
                        "left": pair["left"],
                        "right": pair["right"],
                    }
                )
            random.shuffle(right)
            presentation["left"] = left
            presentation["right"] = right
            presentation["links"] = links
    elif question.question_type == Question.Type.SLIDER:
        config = question.config or {}
        presentation["slider"] = {
            "min": config.get("min"),
            "max": config.get("max"),
            "step": config.get("step"),
            "correct": config.get("correct"),
            "tolerance": config.get("tolerance"),
        }

    game_question.presentation = presentation
    game_question.save(update_fields=["presentation"])
    return presentation


def snapshot_options(presentation):
    """Seznam opcij iz zamrznjenega presentation (fallback: [])."""
    return list((presentation or {}).get("options") or [])


def public_question(game_question):
    presentation = ensure_presentation(game_question)
    payload = {
        "game_question_id": str(game_question.id),
        "text": presentation.get("text") or game_question.question.text,
        "question_type": presentation.get("question_type") or game_question.question.question_type,
        "difficulty": presentation.get("difficulty", game_question.question.difficulty),
        "category": presentation.get("category") or game_question.question.category.slug,
        "category_name": presentation.get("category_name") or game_question.question.category.name,
        "image": presentation.get("image") if "image" in presentation else (game_question.question.image or None),
    }
    question_type = payload["question_type"]
    if "option_ids" in presentation:
        by_id = {option["id"]: option for option in snapshot_options(presentation)}
        if not by_id:
            by_id = {option.id: {"id": option.id, "text": option.text} for option in game_question.question.options.all()}
        payload["options"] = [
            {"id": option_id, "text": by_id[option_id]["text"]}
            for option_id in presentation["option_ids"]
            if option_id in by_id
        ]
    if question_type == Question.Type.MATCHING:
        payload["left"] = [{"id": item["id"], "text": item["text"]} for item in presentation.get("left", [])]
        payload["right"] = [{"id": item["id"], "text": item["text"]} for item in presentation.get("right", [])]
    if question_type == Question.Type.SLIDER:
        slider = dict(presentation.get("slider") or {})
        payload["slider"] = {
            "min": slider.get("min"),
            "max": slider.get("max"),
            "step": slider.get("step"),
        }
    return payload
