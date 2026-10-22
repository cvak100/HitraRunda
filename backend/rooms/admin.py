from django.contrib import admin

from rooms.models import Room, RoomMember


class RoomMemberInline(admin.TabularInline):
    model = RoomMember
    extra = 0
    readonly_fields = ("joined_at", "last_activity")


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("code", "host", "status", "visibility", "max_players", "created_at")
    list_filter = ("status", "visibility")
    search_fields = ("code", "host__email", "host__nickname")
    readonly_fields = ("id", "created_at", "started_at", "finished_at")
    inlines = [RoomMemberInline]
