from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.staff import StaffOnly
from game.site_settings import catalog_payload, public_game_config, reset_to_defaults, save_values


class PublicGameConfigView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response(public_game_config())


class AdminSiteSettingsView(APIView):
    permission_classes = [StaffOnly]

    def get(self, request):
        return Response(catalog_payload())

    def put(self, request):
        try:
            save_values(request.data.get("values") or request.data)
        except ValueError as exc:
            detail = exc.args[0] if exc.args else "Neveljavne nastavitve."
            if isinstance(detail, dict):
                detail = "; ".join(f"{key}: {msg}" for key, msg in detail.items())
            return Response({"detail": str(detail)}, status=400)
        return Response(catalog_payload())


class AdminSiteSettingsResetView(APIView):
    permission_classes = [StaffOnly]

    def post(self, request):
        reset_to_defaults()
        return Response(catalog_payload())
