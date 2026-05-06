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
            "  border-image-repeat: stretch;",
            "}",
        ]
    )
