"""Katalog Django testov + zagon iz admin UI (staff)."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.staff import StaffOnly

CACHE_KEY = "admin_tests_last_run"
CACHE_TTL = 60 * 60 * 24

TEST_SUITES = [
    {
        "id": "accounts",
        "label": "Računi in gosti",
        "module": "accounts.tests",
        "group": "Jedro",
        "description": "Prijava, gosti, staff, čiščenje gostov.",
    },
    {
        "id": "questions",
        "label": "Vprašanja in pritožbe",
        "module": "questions.tests",
        "group": "Vsebina",
        "description": "Kategorije, pritožbe, admin summary.",
    },
    {
        "id": "solo",
        "label": "Hitra runda / Ala milijonar",
        "module": "game.tests",
        "group": "Igre",
        "description": "Solo potek, timeout, jokerji, WebSocket osnovno.",
    },
    {
        "id": "multiplayer",
        "label": "Hitra tekma",
        "module": "game.tests_multiplayer",
        "group": "Igre",
        "description": "Lobby, boti, rundni bonus, connection_epoch.",
    },
    {
        "id": "dirka",
        "label": "Dirka",
        "module": "game.tests_dirka",
        "group": "Igre",
        "description": "Dirka do točk, bonusi.",
    },
    {
        "id": "sixty",
        "label": "60 sekund",
        "module": "game.tests_sixty",
        "group": "Igre",
        "description": "Skupni čas, skip, težavnost.",
    },
    {
        "id": "stability",
        "label": "Stabilnost",
        "module": "game.tests_stability",
        "group": "Igre",
        "description": "Zgodnji timeout, lobby mid-game, host offline, stale sobe.",
    },
]


def _suite_map():
    return {item["id"]: item for item in TEST_SUITES}


def _runs_allowed():
    if settings.DEBUG:
        return True
    return os.environ.get("DJANGO_ALLOW_ADMIN_TESTS", "0") == "1"


class AdminTestCatalogView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        last = cache.get(CACHE_KEY) or {}
        return Response(
            {
                "suites": TEST_SUITES,
                "can_run": _runs_allowed(),
                "last_run": last,
                "hint": (
                    None
                    if _runs_allowed()
                    else "Zagon je na voljo ob DJANGO_DEBUG=1 ali DJANGO_ALLOW_ADMIN_TESTS=1."
                ),
            }
        )


class AdminTestRunView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request):
        if not _runs_allowed():
            return Response(
                {"detail": "Zagon testov ni omogočen (nastavi DJANGO_DEBUG ali DJANGO_ALLOW_ADMIN_TESTS)."},
                status=403,
            )
        suite_id = str(request.data.get("suite") or "").strip()
        suite = _suite_map().get(suite_id)
        if suite is None:
            return Response({"detail": "Neznan paket testov."}, status=400)

        manage = Path(settings.BASE_DIR) / "manage.py"
        started = time.time()
        try:
            proc = subprocess.run(
                [sys.executable, str(manage), "test", suite["module"], "--verbosity=1"],
                cwd=str(settings.BASE_DIR),
                capture_output=True,
                text=True,
                timeout=240,
                env={**os.environ},
            )
        except subprocess.TimeoutExpired as exc:
            result = {
                "suite": suite_id,
                "label": suite["label"],
                "ok": False,
                "returncode": -1,
                "duration_s": round(time.time() - started, 2),
                "stdout": (exc.stdout or "")[-8000:],
                "stderr": ((exc.stderr or "") + "\nTIMEOUT (240s)")[-4000:],
                "ran_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            cache.set(CACHE_KEY, result, CACHE_TTL)
            return Response(result, status=504)

        result = {
            "suite": suite_id,
            "label": suite["label"],
            "ok": proc.returncode == 0,
            "returncode": proc.returncode,
            "duration_s": round(time.time() - started, 2),
            "stdout": (proc.stdout or "")[-8000:],
            "stderr": (proc.stderr or "")[-4000:],
            "ran_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        cache.set(CACHE_KEY, result, CACHE_TTL)
        return Response(result)
