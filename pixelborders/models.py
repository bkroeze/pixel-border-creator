import json

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.template.defaultfilters import slugify


DEFAULT_PALETTE = ["#2f2a22", "#f2c14e", "#3f88c5"]
BORDER_REPEAT_CHOICES = [
    ("stretch", "Stretch"),
    ("repeat", "Repeat"),
    ("round", "Round"),
]


def default_palette():
    return list(DEFAULT_PALETTE)


def default_pixels():
    return [[None for _ in range(21)] for _ in range(21)]


class PixelBorderDesign(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="pixel_border_designs",
    )
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=96)
    is_public = models.BooleanField(default=False)
    width = models.PositiveSmallIntegerField(default=21)
    height = models.PositiveSmallIntegerField(default=21)
    border_repeat = models.CharField(
        max_length=10,
        choices=BORDER_REPEAT_CHOICES,
        default="stretch",
    )
    palette = models.JSONField(default=default_palette)
    pixels = models.JSONField(default=default_pixels)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "slug"], name="unique_design_slug_per_owner")
        ]
        ordering = ["-updated_at", "name"]

    def __str__(self):
        return self.name

    @property
    def css_class_name(self):
        return f"frm-{self.slug}"

    @property
    def slice_size(self):
        return max(1, min(self.width, self.height) // 3)

    def is_visible_to(self, user):
        return self.is_public or (user.is_authenticated and self.owner_id == user.id)

    def can_edit(self, user):
        return user.is_authenticated and self.owner_id == user.id

    @property
    def preview_json(self):
        return json.dumps(
            {
                "width": self.width,
                "height": self.height,
                "palette": self.palette,
                "pixels": self.pixels,
                "className": self.css_class_name,
                "slice": self.slice_size,
                "repeat": self.border_repeat,
            }
        )

    def clean(self):
        errors = {}
        if not 5 <= self.width <= 100:
            errors["width"] = "Width must be between 5 and 100."
        if not 5 <= self.height <= 100:
            errors["height"] = "Height must be between 5 and 100."
        if self.border_repeat not in {choice[0] for choice in BORDER_REPEAT_CHOICES}:
            errors["border_repeat"] = "Border repeat must be stretch, repeat, or round."
        if not isinstance(self.palette, list) or len(self.palette) != 3:
            errors["palette"] = "Palette must contain exactly three colors."
        elif not all(isinstance(color, str) and color.startswith("#") for color in self.palette):
            errors["palette"] = "Palette colors must be CSS hex color strings."
        if not isinstance(self.pixels, list) or len(self.pixels) != self.height:
            errors["pixels"] = "Pixel grid height must match the design height."
        else:
            for row in self.pixels:
                if not isinstance(row, list) or len(row) != self.width:
                    errors["pixels"] = "Pixel grid width must match the design width."
                    break
                if any(cell not in (None, 0, 1, 2) for cell in row):
                    errors["pixels"] = "Pixels must be null, 0, 1, or 2."
                    break
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        self.slug = self._available_slug()
        self.full_clean()
        super().save(*args, **kwargs)

    def _available_slug(self):
        base = slugify(self.name) or "untitled"
        slug = base[:80]
        suffix = 2
        queryset = PixelBorderDesign.objects.filter(owner=self.owner)
        if self.pk:
            queryset = queryset.exclude(pk=self.pk)
        candidate = slug
        while queryset.filter(slug=candidate).exists():
            suffix_text = f"-{suffix}"
            candidate = f"{slug[:96 - len(suffix_text)]}{suffix_text}"
            suffix += 1
        return candidate
