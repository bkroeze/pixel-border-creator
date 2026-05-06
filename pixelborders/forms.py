import json

from django import forms
from django.forms.models import construct_instance

from .models import DEFAULT_PALETTE, PixelBorderDesign, default_pixels


class PixelBorderDesignForm(forms.ModelForm):
    design_id = forms.IntegerField(required=False, widget=forms.HiddenInput)
    palette_json = forms.CharField(widget=forms.HiddenInput)
    pixels_json = forms.CharField(widget=forms.HiddenInput)

    class Meta:
        model = PixelBorderDesign
        fields = ["name", "is_public", "border_repeat", "width", "height"]
        widgets = {
            "name": forms.TextInput(attrs={"placeholder": "Design name"}),
            "width": forms.NumberInput(attrs={"min": 5, "max": 100}),
            "height": forms.NumberInput(attrs={"min": 5, "max": 100}),
        }

    def clean_palette_json(self):
        value = self.cleaned_data["palette_json"]
        try:
            palette = json.loads(value)
        except json.JSONDecodeError as exc:
            raise forms.ValidationError("Palette JSON is invalid.") from exc
        if not isinstance(palette, list) or len(palette) != 3:
            raise forms.ValidationError("Palette must contain exactly three colors.")
        return palette

    def clean_pixels_json(self):
        value = self.cleaned_data["pixels_json"]
        try:
            pixels = json.loads(value)
        except json.JSONDecodeError as exc:
            raise forms.ValidationError("Pixel JSON is invalid.") from exc
        return pixels

    def clean(self):
        cleaned = super().clean()
        if self.errors:
            return cleaned
        if cleaned.get("width") != cleaned.get("height"):
            raise forms.ValidationError("Pixel border designs must be square.")
        probe = PixelBorderDesign(
            owner=self.owner,
            name=cleaned.get("name") or "Untitled",
            is_public=cleaned.get("is_public", False),
            width=cleaned.get("width") or 21,
            height=cleaned.get("height") or 21,
            palette=cleaned.get("palette_json") or DEFAULT_PALETTE,
            pixels=cleaned.get("pixels_json") or default_pixels(),
            border_repeat=cleaned.get("border_repeat") or "stretch",
        )
        try:
            probe.clean()
        except forms.ValidationError as exc:
            raise exc
        return cleaned

    def __init__(self, *args, owner=None, **kwargs):
        self.owner = owner
        super().__init__(*args, **kwargs)

    def _post_clean(self):
        self.instance = construct_instance(self, self.instance, self._meta.fields, self._meta.exclude)

    def save(self, commit=True):
        instance = super().save(commit=False)
        instance.owner = self.owner
        instance.palette = self.cleaned_data["palette_json"]
        instance.pixels = self.cleaned_data["pixels_json"]
        if commit:
            instance.save()
        return instance
