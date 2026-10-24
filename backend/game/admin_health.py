"""Podrobni health (DB + Redis) za admin."""

from __future__ import annotations

from urllib.parse import urlparse

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.staff import StaffOnly


def _mask_redis_url(url: str) -> str:
    try:
        parsed = urlparse(url)
        host = parsed.hostname or "?"
        port = parsed.port or 6379
        db = (parsed.path or "/0").lstrip("/") or "0"
        return f"redis://{host}:{port}/{db}"
    except Exception:
        return "redis://…"


def collect_health(detail: bool = False) -> dict:
    now = timezone.now()
    db = _check_db(detail=detail)
    redis_info = _check_redis(detail=detail)
    cache_info = _check_django_cache()
    return {
        "generated_at": now.isoformat(),
        "version": getattr(settings, "APP_VERSION", ""),
        "ok": bool(db["ok"] and redis_info["ok"]),
        "db": db,
        "redis": redis_info,
        "django_cache": cache_info,
    }


def _check_db(*, detail: bool) -> dict:
    payload = {"ok": False, "detail": "", "engine": "", "name": "", "host": ""}
    try:
        conf = settings.DATABASES.get("default") or {}
        payload["engine"] = str(conf.get("ENGINE") or "").rsplit(".", 1)[-1]
        payload["name"] = str(conf.get("NAME") or "")
        payload["host"] = str(conf.get("HOST") or "")
        connection.ensure_connection()
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
            if detail:
                try:
                    cursor.execute("SELECT version()")
                    row = cursor.fetchone()
                    payload["version"] = row[0] if row else ""
                except Exception:
                    payload["version"] = ""
        payload["ok"] = True
        payload["detail"] = "OK"
    except Exception as exc:
        payload["detail"] = str(exc)[:300]
    return payload


def _check_django_cache() -> dict:
    payload = {"ok": False, "detail": "", "backend": ""}
    try:
        backend = cache.__class__.__module__ + "." + cache.__class__.__name__
        payload["backend"] = backend
        cache.set("admin_health_ping", "1", 10)
        payload["ok"] = cache.get("admin_health_ping") == "1"
        payload["detail"] = "OK" if payload["ok"] else "Cache ni odgovoril."
    except Exception as exc:
        payload["detail"] = str(exc)[:200]
    return payload


def _check_redis(*, detail: bool) -> dict:
    url = getattr(settings, "REDIS_URL", "") or "redis://localhost:6379/0"
    payload = {
        "ok": False,
        "detail": "",
        "url": _mask_redis_url(url),
        "used_for": ["channels (WebSocket)", "channel layer"],
        "ping_ms": None,
        "info": {},
        "stats": {},
    }
    client = None
    try:
        import time

        import redis

        client = redis.Redis.from_url(url, socket_connect_timeout=3, socket_timeout=3, decode_responses=True)
        t0 = time.perf_counter()
        pong = client.ping()
        payload["ping_ms"] = round((time.perf_counter() - t0) * 1000, 2)
        payload["ok"] = bool(pong)
        payload["detail"] = "OK" if pong else "PING ni uspel."
        if detail and pong:
            info = client.info()
            payload["info"] = {
                "redis_version": info.get("redis_version"),
                "redis_mode": info.get("redis_mode"),
                "os": info.get("os"),
                "arch_bits": info.get("arch_bits"),
                "uptime_in_seconds": info.get("uptime_in_seconds"),
                "uptime_in_days": info.get("uptime_in_days"),
                "connected_clients": info.get("connected_clients"),
                "blocked_clients": info.get("blocked_clients"),
                "used_memory_human": info.get("used_memory_human"),
                "used_memory_peak_human": info.get("used_memory_peak_human"),
                "used_memory_rss_human": info.get("used_memory_rss_human"),
                "mem_fragmentation_ratio": info.get("mem_fragmentation_ratio"),
                "total_system_memory_human": info.get("total_system_memory_human"),
                "maxmemory_human": info.get("maxmemory_human") or "0 (neomejeno)",
                "maxmemory_policy": info.get("maxmemory_policy"),
                "instantaneous_ops_per_sec": info.get("instantaneous_ops_per_sec"),
                "keyspace_hits": info.get("keyspace_hits"),
                "keyspace_misses": info.get("keyspace_misses"),
                "expired_keys": info.get("expired_keys"),
                "evicted_keys": info.get("evicted_keys"),
                "role": info.get("role"),
                "tcp_port": info.get("tcp_port"),
            }
            keyspace = {}
            for key, value in info.items():
                if str(key).startswith("db"):
                    keyspace[key] = value
            payload["keyspace"] = keyspace
            hits = int(info.get("keyspace_hits") or 0)
            misses = int(info.get("keyspace_misses") or 0)
            total = hits + misses
            payload["stats"] = {
                "hit_rate_pct": round((hits / total) * 100, 2) if total else None,
                "dbsize": client.dbsize(),
                "used_memory": info.get("used_memory"),
                "connected_clients": info.get("connected_clients"),
                "ops_per_sec": info.get("instantaneous_ops_per_sec"),
            }
            try:
                from channels.layers import get_channel_layer

                layer = get_channel_layer()
                payload["channels"] = {
                    "ok": layer is not None,
                    "backend": getattr(settings, "CHANNEL_LAYERS", {})
                    .get("default", {})
                    .get("BACKEND", ""),
                    "detail": "Channel layer je naložen." if layer else "Channel layer manjka.",
                }
            except Exception as exc:
                payload["channels"] = {"ok": False, "detail": str(exc)[:200]}
            if detail:
                payload["history"] = _record_and_load_history(client, payload)
    except Exception as exc:
        payload["ok"] = False
        payload["detail"] = str(exc)[:300]
    finally:
        if client is not None:
            try:
                client.close()
            except Exception:
                pass
    return payload


HISTORY_KEY = "hitrarunda:ops:redis_history"
HISTORY_MAX = 96  # ~ če odpreš health vsake 15 min = 24 h


def _record_and_load_history(client, redis_payload: dict) -> list[dict]:
    """Redis nima vgrajene zgodovine metrik — shranimo snapshot ob vsakem health klicu."""
    import json

    from django.utils import timezone

    stats = redis_payload.get("stats") or {}
    snap = {
        "at": timezone.now().isoformat(),
        "ping_ms": redis_payload.get("ping_ms"),
        "used_memory_human": (redis_payload.get("info") or {}).get("used_memory_human"),
        "used_memory": stats.get("used_memory"),
        "connected_clients": stats.get("connected_clients"),
        "ops_per_sec": stats.get("ops_per_sec"),
        "dbsize": stats.get("dbsize"),
        "hit_rate_pct": stats.get("hit_rate_pct"),
    }
    try:
        client.lpush(HISTORY_KEY, json.dumps(snap, ensure_ascii=False))
        client.ltrim(HISTORY_KEY, 0, HISTORY_MAX - 1)
        raw = client.lrange(HISTORY_KEY, 0, HISTORY_MAX - 1)
        out = []
        for item in raw:
            try:
                out.append(json.loads(item))
            except Exception:
                continue
        return out
    except Exception:
        return [snap]


class AdminHealthView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        detail = str(request.query_params.get("detail") or "1") != "0"
        return Response(collect_health(detail=detail))

    def delete(self, request):
        """Počisti shranjeno Redis zgodovino snapshotov."""
        url = getattr(settings, "REDIS_URL", "") or "redis://localhost:6379/0"
        try:
            import redis

            client = redis.Redis.from_url(url, socket_connect_timeout=3, socket_timeout=3)
            client.delete(HISTORY_KEY)
            client.close()
        except Exception as exc:
            return Response({"detail": str(exc)[:200]}, status=400)
        return Response({"detail": "Zgodovina Redis snapshotov je izbrisana."})
