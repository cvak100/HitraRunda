from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from geo.models import Country
from questions.views import StaffOnly


def country_payload(country: Country) -> dict:
    data = country.data or {}
    return {
        "iso2": country.iso2,
        "iso3": country.iso3,
        "name_sl": country.name_sl,
        "name_en": country.name_en,
        "continent": country.continent,
        "subregion": country.subregion,
        "flag_code": country.flag_code or country.iso2,
        "flag_emoji": ((data.get("flag") or {}).get("emoji") or ""),
        "capital_sl": country.capital_sl,
        "capital_en": country.capital_en,
        "difficulty": country.difficulty,
        "active": country.active,
        "quiz_exclude": country.quiz_exclude,
        "borders_iso2": country.border_iso2(),
        "data": data,
    }


def _apply_core(country: Country, payload: dict) -> None:
    if "name_sl" in payload:
        name_sl = str(payload.get("name_sl") or "").strip()
        if not name_sl:
            raise ValueError("Ime (SL) je obvezno.")
        country.name_sl = name_sl[:120]
    if "name_en" in payload:
        country.name_en = str(payload.get("name_en") or "").strip()[:120]
    if "iso3" in payload:
        country.iso3 = str(payload.get("iso3") or "").strip().lower()[:3]
    if "continent" in payload:
        continent = str(payload.get("continent") or "").strip().lower()
        if not continent:
            raise ValueError("Kontinent je obvezen.")
        country.continent = continent[:32]
    if "subregion" in payload:
        country.subregion = str(payload.get("subregion") or "").strip().lower()[:64]
    if "flag_code" in payload:
        country.flag_code = str(payload.get("flag_code") or country.iso2).strip().lower()[:8]
    if "capital_sl" in payload:
        country.capital_sl = str(payload.get("capital_sl") or "").strip()[:120]
    if "capital_en" in payload:
        country.capital_en = str(payload.get("capital_en") or "").strip()[:120]
    if "difficulty" in payload:
        try:
            country.difficulty = max(1, min(5, int(payload.get("difficulty") or 1)))
        except (TypeError, ValueError) as exc:
            raise ValueError("Težavnost mora biti 1–5.") from exc
    if "active" in payload:
        if not isinstance(payload.get("active"), bool):
            raise ValueError("active mora biti true/false.")
        country.active = payload["active"]
    if "quiz_exclude" in payload:
        if not isinstance(payload.get("quiz_exclude"), bool):
            raise ValueError("quiz_exclude mora biti true/false.")
        country.quiz_exclude = payload["quiz_exclude"]
    if "data" in payload:
        raw = payload.get("data")
        if raw is None:
            country.data = {}
        elif isinstance(raw, dict):
            country.data = raw
        else:
            raise ValueError("data mora biti objekt.")

    # Sinhroniziraj pogosta polja nazaj v JSON paket.
    data = dict(country.data or {})
    name = dict(data.get("name") or {})
    name["sl"] = country.name_sl
    if country.name_en:
        name["en"] = country.name_en
    data["name"] = name
    capital = dict(data.get("capital") or {})
    if country.capital_sl:
        capital["sl"] = country.capital_sl
    if country.capital_en:
        capital["en"] = country.capital_en
    if capital:
        data["capital"] = capital
    geography = dict(data.get("geography") or {})
    geography["continent"] = country.continent
    if country.subregion:
        geography["subregion"] = country.subregion
    data["geography"] = geography
    politics = dict(data.get("politics") or {})
    politics["active"] = country.active
    politics["quiz_exclude"] = country.quiz_exclude
    data["politics"] = politics
    quiz = dict(data.get("quiz") or {})
    quiz["difficulty"] = country.difficulty
    data["quiz"] = quiz
    flag = dict(data.get("flag") or {})
    flag["code"] = country.flag_code or country.iso2
    data["flag"] = flag
    data["iso2"] = country.iso2
    if country.iso3:
        data["iso3"] = country.iso3
    country.data = data


class AdminCountryListView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        qs = Country.objects.all().order_by("name_sl")
        continent = str(request.query_params.get("continent") or "").strip().lower()
        if continent:
            qs = qs.filter(continent=continent)
        q = str(request.query_params.get("q") or "").strip()
        if q:
            from django.db.models import Q

            qs = qs.filter(
                Q(iso2__icontains=q)
                | Q(iso3__icontains=q)
                | Q(name_sl__icontains=q)
                | Q(name_en__icontains=q)
                | Q(capital_sl__icontains=q)
            )
        return Response(
            {
                "countries": [country_payload(c) for c in qs],
                "total": qs.count(),
            }
        )


class AdminCountryImportView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request):
        from geo.importer import import_countries

        raw = request.data.get("payload")
        if raw is None:
            return Response({"detail": "Manjka payload."}, status=400)
        only_new = bool(request.data.get("only_new"))
        if isinstance(raw, (dict, list)):
            import json

            raw = json.dumps(raw, ensure_ascii=False)
        try:
            report = import_countries(raw, only_new=only_new)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        status = 400 if report.get("errors") else 200
        return Response(report, status=status)


class AdminCountryDetailView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request, iso2):
        country = get_object_or_404(Country, pk=str(iso2).lower())
        return Response({"country": country_payload(country)})

    def post(self, request, iso2):
        country = get_object_or_404(Country, pk=str(iso2).lower())
        try:
            _apply_core(country, request.data if isinstance(request.data, dict) else {})
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        country.save()
        return Response({"country": country_payload(country)})
