import json
import re

from django.conf import settings
from django.core.exceptions import ValidationError

from .models import DEFAULT_PALETTE, PixelBorderDesign, default_pixels


SYSTEM_PROMPT = """You generate tiny pixel-art CSS border-image frames.
Return only JSON with keys: name, palette, pixels.
palette must be exactly three CSS hex colors.
pixels must be a square 2D array using only null, 0, 1, or 2.
Use null for transparent cells. Put most detail in the outer border and corners.
Keep the center mostly transparent so page content can show through."""


def _extract_json(value):
    text = str(value).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _normalize_palette(palette):
    if not isinstance(palette, list):
        return list(DEFAULT_PALETTE)
    colors = []
    for color in palette[:3]:
        if isinstance(color, str) and re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            colors.append(color.lower())
    while len(colors) < 3:
        colors.append(DEFAULT_PALETTE[len(colors)])
    return colors


def _normalize_pixels(pixels, size):
    if not isinstance(pixels, list):
        return default_pixels() if size == 21 else [[None for _ in range(size)] for _ in range(size)]
    normalized = []
    for y in range(size):
        source = pixels[y] if y < len(pixels) and isinstance(pixels[y], list) else []
        row = []
        for x in range(size):
            value = source[x] if x < len(source) else None
            row.append(value if value in (None, 0, 1, 2) else None)
        normalized.append(row)
    return normalized


def generate_frame(description, size, current=None, variation=False):
    try:
        import llm
    except ImportError as exc:
        raise RuntimeError("The llm package is not installed in this environment.") from exc

    size = max(5, min(100, int(size)))
    prompt = {
        "request": description,
        "size": size,
        "mode": "variation" if variation else "new",
        "current": current if variation else None,
    }
    model = llm.get_model(getattr(settings, "PIXELBORDERS_LLM_MODEL", "gpt-5-mini"))
    response = model.prompt(
        json.dumps(prompt),
        system=SYSTEM_PROMPT,
    )
    data = _extract_json(response)
    name = data.get("name") if isinstance(data.get("name"), str) else "AI Border"
    palette = _normalize_palette(data.get("palette"))
    pixels = _normalize_pixels(data.get("pixels"), size)
    probe = PixelBorderDesign(
        owner=current.get("owner") if isinstance(current, dict) else None,
        name=name[:80] or "AI Border",
        width=size,
        height=size,
        palette=palette,
        pixels=pixels,
    )
    try:
        probe.clean()
    except ValidationError as exc:
        raise RuntimeError("The model returned invalid pixel data.") from exc
    return {
        "name": probe.name,
        "palette": palette,
        "pixels": pixels,
        "width": size,
        "height": size,
    }
