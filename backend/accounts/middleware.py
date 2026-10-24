import ipaddress
from urllib.parse import urlparse

from django.conf import settings
from django.utils import timezone

from accounts.models import User


class DebugLanCsrfMiddleware:
    """
    V DEBUG zaupa CSRF izvorom z zasebnega LAN IP (telefon → PC).
    CSRF_TRUSTED_ORIGINS namreč ne podpira *, zato jih dopolnimo na zahtevo.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if settings.DEBUG:
            origin = (request.META.get("HTTP_ORIGIN") or "").strip()
            if origin and origin not in settings.CSRF_TRUSTED_ORIGINS:
                host = urlparse(origin).hostname or ""
                if self._is_lan_host(host):
                    settings.CSRF_TRUSTED_ORIGINS.append(origin)
        return self.get_response(request)

    @staticmethod
    def _is_lan_host(host: str) -> bool:
        if not host:
            return False
        if host.endswith(".local"):
            return True
        try:
            ip = ipaddress.ip_address(host)
            return bool(ip.is_private or ip.is_loopback or ip.is_link_local)
        except ValueError:
            return False


class LastSeenMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        user = getattr(request, "user", None)
        if user and user.is_authenticated and request.path.startswith("/api/"):
            now = timezone.now()
            if user.last_seen is None or (now - user.last_seen).total_seconds() >= 60:
                User.objects.filter(pk=user.pk).update(last_seen=now)
        return response
