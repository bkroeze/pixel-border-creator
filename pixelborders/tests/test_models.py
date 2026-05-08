from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from pixelborders.css import generate_css, generate_css_with_image, render_png_data_url
from pixelborders.models import PixelBorderDesign, default_pixels


class PixelBorderDesignModelTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user("artist", password="pw")

    def test_default_design_shape(self):
        design = PixelBorderDesign(owner=self.user, name="Default")
        self.assertEqual(design.width, 21)
        self.assertEqual(design.height, 21)
        self.assertEqual(len(design.palette), 3)
        self.assertEqual(len(design.pixels), 21)
        self.assertEqual(len(design.pixels[0]), 21)

    def test_dimensions_are_limited(self):
        design = PixelBorderDesign(owner=self.user, name="Tiny", width=4, height=101)
        with self.assertRaises(ValidationError):
            design.full_clean()

    def test_grid_shape_must_match_dimensions(self):
        design = PixelBorderDesign(owner=self.user, name="Bad", width=5, height=5, pixels=default_pixels())
        with self.assertRaises(ValidationError):
            design.full_clean()

    def test_name_slugifies_and_duplicate_gets_suffix(self):
        first = PixelBorderDesign.objects.create(owner=self.user, name="My Border!")
        second = PixelBorderDesign.objects.create(owner=self.user, name="My Border!")
        self.assertEqual(first.slug, "my-border")
        self.assertEqual(second.slug, "my-border-2")

    def test_slug_tracks_name_changes(self):
        design = PixelBorderDesign.objects.create(owner=self.user, name="Old Name")
        design.name = "New Name"
        design.save()
        self.assertEqual(design.slug, "new-name")

    def test_visibility_and_permissions(self):
        other = get_user_model().objects.create_user("viewer", password="pw")
        private = PixelBorderDesign.objects.create(owner=self.user, name="Private")
        public = PixelBorderDesign.objects.create(owner=self.user, name="Public", is_public=True)
        self.assertFalse(private.is_visible_to(other))
        self.assertTrue(public.is_visible_to(other))
        self.assertFalse(public.can_edit(other))

    def test_css_generation(self):
        design = PixelBorderDesign.objects.create(owner=self.user, name="Fancy Frame", border_repeat="round")
        css = generate_css(design, "data:image/png;base64,abc")
        self.assertIn(".frm-fancy-frame", css)
        self.assertIn("border-image-source", css)
        self.assertIn("border-image-slice: 7 fill", css)
        self.assertIn("border-image-repeat: round", css)

    def test_png_data_url_generation(self):
        pixels = default_pixels()
        pixels[0][0] = 0
        design = PixelBorderDesign.objects.create(owner=self.user, name="Image Frame", pixels=pixels)
        data_url = render_png_data_url(design)
        self.assertTrue(data_url.startswith("data:image/png;base64,"))
        self.assertIn(data_url, generate_css_with_image(design))
        self.assertNotIn("__PIXEL_BORDER_IMAGE__", generate_css_with_image(design))

    def test_border_repeat_is_limited_to_css_repeat_modes(self):
        design = PixelBorderDesign(owner=self.user, name="Bad Repeat", border_repeat="space")
        with self.assertRaises(ValidationError):
            design.full_clean()
