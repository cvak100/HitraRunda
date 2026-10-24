import json
from pathlib import Path

from django.core.exceptions import ValidationError
from django.core.validators import URLValidator
from django.db import transaction

from questions.models import Category, Question, QuestionOption

CATEGORIES = (
    ("sport", "Šport", 1),
    ("zemljepis", "Zemljepis", 2),
    ("zgodovina", "Zgodovina", 3),
    ("narava", "Narava", 4),
    ("znanost", "Znanost", 5),
    ("kultura", "Kultura", 6),
    ("literatura", "Literatura", 7),
    ("glasba", "Glasba", 8),
    ("film", "Film in TV", 9),
    ("politika", "Politika", 10),
    ("kulinarika", "Kulinarika", 11),
    ("slovenija", "Slovenija", 12),
    ("zivali", "Živali", 13),
    ("astronomija", "Astronomija", 14),
    ("zemljepis-slovenije", "Zemljepis Slovenije", 15),
)

# V JSON lahko pride »živali« (s šumnikom); v bazi je kanonični slug »zivali«.
CATEGORY_ALIASES = {
    "živali": "zivali",
}
CHOICE_TYPES = {"multiple_choice", "true_false", "multi_select"}
QUESTION_TYPES = CHOICE_TYPES | {"ordering", "matching", "slider"}


class ImportProblem(Exception):
    def __init__(self, message):
        self.message = message
        super().__init__(message)


def ensure_categories():
    """Doda manjkajoče privzete kategorije; obstoječih ne prepisuje."""
    for slug, name, order in CATEGORIES:
        Category.objects.get_or_create(
            slug=slug,
            defaults={"name": name, "order": order, "is_active": True},
        )


def import_payload(raw):
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8-sig")
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        return {"created": 0, "updated": 0, "errors": [f"Datoteka ni veljaven JSON: {exc}"]}

    if isinstance(data, list):
        items = data
        version = 1
    elif isinstance(data, dict):
        version = data.get("version", 1)
        items = data.get("questions")
    else:
        return {"created": 0, "updated": 0, "errors": ["Koren JSON mora biti objekt s seznamom questions."]}

    if version != 1:
        return {"created": 0, "updated": 0, "errors": ["Podprta je samo različica 1."]}
    if not isinstance(items, list):
        return {"created": 0, "updated": 0, "errors": ["Polje questions mora biti seznam."]}

    ensure_categories()
    cleaned = []
    errors = []
    seen = set()
    for index, item in enumerate(items, start=1):
        label = item.get("key") if isinstance(item, dict) else None
        label = label or f"#{index}"
        try:
            cleaned.append(_clean_item(item, seen))
        except ImportProblem as exc:
            errors.append(f"{label}: {exc.message}")
    if errors:
        return {"created": 0, "updated": 0, "errors": errors}

    created = 0
    updated = 0
    with transaction.atomic():
        for item in cleaned:
            if _upsert(item):
                created += 1
            else:
                updated += 1
    return {"created": created, "updated": updated, "errors": []}


def export_payload():
    questions = (
        Question.objects.select_related("category")
        .prefetch_related("options")
        .order_by("category__order", "difficulty", "external_key")
    )
    return {"version": 1, "questions": [_export_question(question) for question in questions]}


def _clean_item(item, seen):
    if not isinstance(item, dict):
        raise ImportProblem("Vprašanje mora biti objekt.")
    key = str(item.get("key") or "").strip()
    if not key or any(char.isspace() for char in key) or len(key) > 80:
        raise ImportProblem("key je obvezen, brez presledkov, do 80 znakov.")
    if key in seen:
        raise ImportProblem("key je v datoteki podvojen.")
    seen.add(key)

    category = str(item.get("category") or "").strip()
    category = CATEGORY_ALIASES.get(category, category)
    known_categories = set(Category.objects.values_list("slug", flat=True))
    if category not in known_categories:
        raise ImportProblem(f"Neznana kategorija ({item.get('category')}).")

    question_type = item.get("question_type")
    if question_type not in QUESTION_TYPES:
        raise ImportProblem("question_type ni podprt.")

    difficulty = _as_int(item.get("difficulty"), "difficulty")
    if not 1 <= difficulty <= 5:
        raise ImportProblem("difficulty je od 1 do 5.")

    text = str(item.get("text") or "").strip()
    if not text:
        raise ImportProblem("text je obvezen.")
    explanation = str(item.get("explanation") or "").strip()
    image = item.get("image") or None
    if isinstance(image, str):
        image = image.strip() or None
    if image is not None:
        if not isinstance(image, str) or len(image) > 500:
            raise ImportProblem("image je predolg.")
        try:
            URLValidator()(image)
        except ValidationError:
            raise ImportProblem("image mora biti URL.")

    is_active = item.get("is_active", True)
    if not isinstance(is_active, bool):
        raise ImportProblem("is_active mora biti true ali false.")

    cleaned = {
        "key": key,
        "category": category,
        "question_type": question_type,
        "difficulty": difficulty,
        "text": text,
        "explanation": explanation,
        "image": image,
        "is_active": is_active,
        "options": [],
        "config": {},
    }

    if question_type in CHOICE_TYPES or question_type == "ordering":
        cleaned["options"] = _clean_options(item.get("options"), question_type)
    elif question_type == "matching":
        cleaned["config"] = {"pairs": _clean_pairs(item.get("pairs"))}
    elif question_type == "slider":
        cleaned["config"] = _clean_slider(item.get("slider"))
    return cleaned


def _clean_options(raw, question_type):
    if not isinstance(raw, list) or len(raw) < 2:
        raise ImportProblem("options potrebuje vsaj dve možnosti.")
    options = []
    for index, option in enumerate(raw):
        if not isinstance(option, dict):
            raise ImportProblem("Možnost mora biti objekt.")
        text = str(option.get("text") or "").strip()
        if not text or len(text) > 500:
            raise ImportProblem("Besedilo možnosti je obvezno in krajše od 500 znakov.")
        correct = bool(option.get("correct", False)) if question_type != "ordering" else False
        options.append({"text": text, "correct": correct})
    if question_type == "multiple_choice":
        if sum(option["correct"] for option in options) != 1:
            raise ImportProblem("multiple_choice ima točno en pravilen odgovor.")
    elif question_type == "true_false":
        if len(options) != 2 or sum(option["correct"] for option in options) != 1:
            raise ImportProblem("true_false ima točno dve možnosti in en pravilen odgovor.")
    elif question_type == "multi_select":
        if sum(option["correct"] for option in options) < 1:
            raise ImportProblem("multi_select ima vsaj en pravilen odgovor.")
    return options


def _clean_pairs(raw):
    if not isinstance(raw, list) or len(raw) < 2:
        raise ImportProblem("pairs potrebuje vsaj dva para.")
    pairs = []
    lefts = set()
    rights = set()
    for pair in raw:
        if not isinstance(pair, dict):
            raise ImportProblem("Par mora biti objekt.")
        left = str(pair.get("left") or "").strip()
        right = str(pair.get("right") or "").strip()
        if not left or not right:
            raise ImportProblem("Par potrebuje left in right.")
        if left in lefts or right in rights:
            raise ImportProblem("Leva in desna besedila parov morajo biti med seboj različna.")
        lefts.add(left)
        rights.add(right)
        pairs.append({"left": left, "right": right})
    return pairs


def _clean_slider(raw):
    if not isinstance(raw, dict):
        raise ImportProblem("slider je obvezen objekt.")
    minimum = _as_number(raw.get("min"), "min")
    maximum = _as_number(raw.get("max"), "max")
    step = _as_number(raw.get("step"), "step")
    correct = _as_number(raw.get("correct"), "correct")
    tolerance = _as_number(raw.get("tolerance"), "tolerance")
    if not minimum < maximum:
        raise ImportProblem("min mora biti manjši od max.")
    if step <= 0:
        raise ImportProblem("step mora biti večji od 0.")
    if not minimum <= correct <= maximum:
        raise ImportProblem("correct mora biti med min in max.")
    if tolerance < 0:
        raise ImportProblem("tolerance ne sme biti negativna.")
    return {
        "min": _tidy(minimum),
        "max": _tidy(maximum),
        "step": _tidy(step),
        "correct": _tidy(correct),
        "tolerance": _tidy(tolerance),
    }


def _upsert(item):
    category = Category.objects.get(slug=item["category"])
    question = Question.objects.filter(external_key=item["key"]).first()
    created = question is None
    if created:
        question = Question(external_key=item["key"], category=category)
    question.category = category
    question.text = item["text"]
    question.difficulty = item["difficulty"]
    question.question_type = item["question_type"]
    question.config = item["config"]
    question.explanation = item["explanation"]
    question.image = item["image"]
    question.is_active = item["is_active"]
    question.save()
    if item["question_type"] == "ordering" or item["question_type"] in CHOICE_TYPES:
        _sync_options(question, item["options"])
    else:
        question.options.all().delete()
    return created


def _sync_options(question, options):
    existing = list(question.options.order_by("order", "id"))
    for index, option in enumerate(options):
        if index < len(existing):
            row = existing[index]
            row.text = option["text"]
            row.is_correct = option["correct"]
            row.order = index
            row.save(update_fields=["text", "is_correct", "order"])
        else:
            QuestionOption.objects.create(
                question=question,
                text=option["text"],
                is_correct=option["correct"],
                order=index,
            )
    for extra in existing[len(options) :]:
        extra.delete()


def _export_question(question):
    payload = {
        "key": question.external_key,
        "category": question.category.slug,
        "question_type": question.question_type,
        "difficulty": question.difficulty,
        "text": question.text,
        "explanation": question.explanation,
        "image": question.image,
    }
    if question.question_type == "matching":
        payload["pairs"] = question.config.get("pairs", [])
    elif question.question_type == "slider":
        config = question.config or {}
        payload["slider"] = {
            "min": config.get("min"),
            "max": config.get("max"),
            "step": config.get("step"),
            "correct": config.get("correct"),
            "tolerance": config.get("tolerance"),
        }
    else:
        options = []
        for option in question.options.all():
            row = {"text": option.text}
            if question.question_type != "ordering":
                row["correct"] = option.is_correct
            options.append(row)
        payload["options"] = options
    if not question.is_active:
        payload["is_active"] = False
    return payload


def _as_int(value, field):
    number = _as_number(value, field)
    if not float(number).is_integer():
        raise ImportProblem(f"{field} mora biti celo število.")
    return int(number)


def _as_number(value, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ImportProblem(f"{field} mora biti število.")
    return float(value)


def _tidy(number):
    if float(number).is_integer():
        return int(number)
    return float(number)


def seed_path():
    return Path(__file__).resolve().parent / "data" / "seed.json"
