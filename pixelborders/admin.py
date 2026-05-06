from django.contrib import admin

from .models import PixelBorderDesign


@admin.register(PixelBorderDesign)
class PixelBorderDesignAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "owner",
        "slug",
        "is_public",
        "width",
        "height",
        "border_repeat",
        "updated_at",
    )
    list_filter = ("is_public", "border_repeat", "created_at", "updated_at")
    search_fields = ("name", "slug", "owner__username", "owner__email")
    readonly_fields = ("slug", "created_at", "updated_at")
    autocomplete_fields = ("owner",)
    fieldsets = (
        (
            None,
            {
                "fields": (
                    "owner",
                    "name",
                    "slug",
                    "is_public",
                    "border_repeat",
                )
            },
        ),
        ("Grid", {"fields": ("width", "height", "palette", "pixels")}),
        ("Timestamps", {"fields": ("created_at", "updated_at")}),
    )
