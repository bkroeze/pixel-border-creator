import base64
import struct
import zlib


def generate_css(design, image_url_placeholder=None):
    image_url = image_url_placeholder or "__PIXEL_BORDER_IMAGE__"
    return "\n".join(
        [
            f".{design.css_class_name} {{",
            "  border-style: solid;",
            f"  border-width: {design.slice_size}px;",
            f'  border-image-source: url("{image_url}");',
            f"  border-image-slice: {design.slice_size} fill;",
            f"  border-image-width: {design.slice_size}px;",
            f"  border-image-repeat: {design.border_repeat};",
            "}",
        ]
    )


def _png_chunk(chunk_type, data):
    return (
        struct.pack(">I", len(data))
        + chunk_type
        + data
        + struct.pack(">I", zlib.crc32(chunk_type + data) & 0xFFFFFFFF)
    )


def _hex_to_rgba(color):
    value = color.lstrip("#")
    return (
        int(value[0:2], 16),
        int(value[2:4], 16),
        int(value[4:6], 16),
        255,
    )


def render_png_data_url(design):
    width = design.width
    height = design.height
    palette = [_hex_to_rgba(color) for color in design.palette]
    rows = []
    for row in design.pixels:
        scanline = bytearray([0])
        for cell in row:
            if cell is None:
                scanline.extend((0, 0, 0, 0))
            else:
                scanline.extend(palette[cell])
        rows.append(bytes(scanline))
    raw = b"".join(rows)
    png = (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + _png_chunk(b"IDAT", zlib.compress(raw))
        + _png_chunk(b"IEND", b"")
    )
    return f"data:image/png;base64,{base64.b64encode(png).decode('ascii')}"


def generate_css_with_image(design):
    return generate_css(design, render_png_data_url(design))


def generate_css_bundle(designs):
    return "\n\n".join(generate_css_with_image(design) for design in designs)
