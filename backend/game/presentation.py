import random
import secrets

from questions.models import Question


def ensure_presentation(game_question):
    if game_question.presentation:
        return game_question.presentation
    question = game_question.question
    if question.question_type in {
        Question.Type.MULTIPLE_CHOICE,
        Question.Type.TRUE_FALSE,
        Question.Type.MULTI_SELECT,
        Question.Type.ORDERING,
    }:
        option_ids = [option.id for option in question.options.all()]
        random.shuffle(option_ids)
        presentation = {"option_ids": option_ids}
    elif question.question_type == Question.Type.MATCHING:
        left = []
        right = []
        links = []
        for pair in question.config.get("pairs", []):
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
        presentation = {"left": left, "right": right, "links": links}
    elif question.question_type == Question.Type.SLIDER:
        config = question.config or {}
        presentation = {
            "slider": {
                "min": config.get("min"),
                "max": config.get("max"),
                "step": config.get("step"),
            }
        }
    else:
        presentation = {}
    game_question.presentation = presentation
    game_question.save(update_fields=["presentation"])
    return presentation


def public_question(game_question):
    question = game_question.question
    presentation = ensure_presentation(game_question)
    payload = {
        "game_question_id": str(game_question.id),
        "text": question.text,
        "question_type": question.question_type,
        "difficulty": question.difficulty,
        "category": question.category.slug,
        "category_name": question.category.name,
        "image": question.image or None,
    }
    if "option_ids" in presentation:
        by_id = {option.id: option for option in question.options.all()}
        payload["options"] = [
            {"id": option_id, "text": by_id[option_id].text}
            for option_id in presentation["option_ids"]
            if option_id in by_id
        ]
    if question.question_type == Question.Type.MATCHING:
        payload["left"] = [{"id": item["id"], "text": item["text"]} for item in presentation.get("left", [])]
        payload["right"] = [{"id": item["id"], "text": item["text"]} for item in presentation.get("right", [])]
    if question.question_type == Question.Type.SLIDER:
        payload["slider"] = dict(presentation.get("slider") or {})
    return payload
