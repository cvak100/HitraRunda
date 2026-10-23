from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.cleanup import cleanup_stale_guests
from accounts.models import User


class StaffOnly(IsAdminUser):
    message = "To je na voljo samo adminu."


def staff_user_payload(user):
    return {
        "id": user.id,
        "nickname": user.nickname,
        "email": user.email,
        "is_guest": user.is_guest,
        "is_staff": user.is_staff,
        "created_at": user.created_at.isoformat(),
    }


class AdminUserListView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        users = User.objects.order_by("-is_staff", "nickname", "id")
        query = str(request.query_params.get("q") or "").strip()
        if query:
            users = users.filter(Q(nickname__icontains=query) | Q(email__icontains=query))
        rows = list(users[:201])
        return Response(
            {
                "users": [staff_user_payload(user) for user in rows[:200]],
                "truncated": len(rows) > 200,
            }
        )


class AdminUserUpdateView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request, pk):
        want = request.data.get("is_staff")
        if not isinstance(want, bool):
            return Response({"detail": "Manjka admin pravica."}, status=400)
        target = get_object_or_404(User, pk=pk)
        if target.id == request.user.id and not want:
            return Response({"detail": "Svojih admin pravic ne moreš odvzeti."}, status=400)
        if want and target.is_guest:
            return Response({"detail": "Admin je lahko samo registriran uporabnik."}, status=400)
        target.is_staff = want
        target.save(update_fields=["is_staff"])
        return Response({"user": staff_user_payload(target)})


class AdminCleanupGuestsView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request):
        from game.site_settings import get as site_get

        days = int(site_get("guest_cleanup_days"))
        deleted = cleanup_stale_guests(days=days)
        return Response(
            {
                "deleted": deleted,
                "days": days,
                "detail": f"Pobrisanih gostov: {deleted} (starejših od {days} dni). Rezultati ostanejo.",
            }
        )
