from django.utils import timezone

from accounts.models import User


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
