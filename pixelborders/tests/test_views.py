import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse

from pixelborders.models import DEFAULT_PALETTE, PixelBorderDesign, default_pixels


class PixelBorderDesignViewTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.owner = User.objects.create_user("owner", password="pw")
        self.viewer = User.objects.create_user("viewer", password="pw")

    def payload(self, **overrides):
        data = {
            "name": "Saved Border",
            "width": "21",
            "height": "21",
            "border_repeat": "round",
            "palette_json": json.dumps(DEFAULT_PALETTE),
            "pixels_json": json.dumps(default_pixels()),
        }
        data.update(overrides)
        return data

    def test_editor_is_public(self):
        response = self.client.get(reverse("pixelborders:editor"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Pixel Border Creator")
        self.assertContains(response, "Login")

    def test_authenticated_editor_shows_username_and_logout(self):
        self.client.login(username="owner", password="pw")
        response = self.client.get(reverse("pixelborders:editor"))
        self.assertContains(response, "owner")
        self.assertContains(response, reverse("logout"))

    def test_anonymous_ai_buttons_are_disabled(self):
        response = self.client.get(reverse("pixelborders:editor"))
        self.assertContains(response, 'title="Generate with AI (logged in only)"')
        self.assertContains(response, "data-ai-open")
        self.assertContains(response, "disabled")

    def test_authenticated_ai_button_is_enabled(self):
        self.client.login(username="owner", password="pw")
        response = self.client.get(reverse("pixelborders:editor"))
        self.assertContains(response, 'title="Generate with AI"')
        self.assertNotContains(response, 'title="Generate with AI (logged in only)"')

    def test_htmx_save_creates_design(self):
        self.client.login(username="owner", password="pw")
        response = self.client.post(
            reverse("pixelborders:save"),
            self.payload(),
            HTTP_HX_REQUEST="true",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(PixelBorderDesign.objects.filter(owner=self.owner, name="Saved Border").exists())
        self.assertEqual(PixelBorderDesign.objects.get(owner=self.owner, name="Saved Border").border_repeat, "round")
        self.assertContains(response, "Visible Designs")

    def test_save_defaults_blank_name(self):
        self.client.login(username="owner", password="pw")
        response = self.client.post(reverse("pixelborders:save"), self.payload(name=""))
        self.assertEqual(response.status_code, 302)
        self.assertTrue(PixelBorderDesign.objects.filter(owner=self.owner, name="Untitled Border").exists())

    def test_save_updates_owned_design_when_name_is_unchanged(self):
        design = PixelBorderDesign.objects.create(owner=self.owner, name="Owned", border_repeat="stretch")
        self.client.login(username="owner", password="pw")
        response = self.client.post(
            reverse("pixelborders:save"),
            self.payload(design_id=str(design.pk), name="Owned", border_repeat="round"),
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(PixelBorderDesign.objects.count(), 1)
        design.refresh_from_db()
        self.assertEqual(design.border_repeat, "round")

    def test_save_creates_copy_when_owned_design_name_changes(self):
        design = PixelBorderDesign.objects.create(owner=self.owner, name="Owned", border_repeat="stretch")
        self.client.login(username="owner", password="pw")
        response = self.client.post(
            reverse("pixelborders:save"),
            self.payload(design_id=str(design.pk), name="Renamed", border_repeat="round"),
        )
        self.assertEqual(response.status_code, 302)
        self.assertTrue(PixelBorderDesign.objects.filter(owner=self.owner, name="Owned", border_repeat="stretch").exists())
        self.assertTrue(PixelBorderDesign.objects.filter(owner=self.owner, name="Renamed", border_repeat="round").exists())

    def test_save_creates_user_copy_for_public_design_owned_by_someone_else(self):
        design = PixelBorderDesign.objects.create(owner=self.owner, name="Public", is_public=True)
        self.client.login(username="viewer", password="pw")
        response = self.client.post(
            reverse("pixelborders:save"),
            self.payload(design_id=str(design.pk), name="Public", border_repeat="round"),
        )
        self.assertEqual(response.status_code, 302)
        design.refresh_from_db()
        self.assertEqual(design.border_repeat, "stretch")
        self.assertTrue(PixelBorderDesign.objects.filter(owner=self.viewer, name="Public", border_repeat="round").exists())

    def test_save_requires_square_design(self):
        self.client.login(username="owner", password="pw")
        response = self.client.post(
            reverse("pixelborders:save"),
            self.payload(width="21", height="18"),
            HTTP_HX_REQUEST="true",
        )
        self.assertEqual(response.status_code, 422)
        self.assertFalse(PixelBorderDesign.objects.filter(owner=self.owner, name="Saved Border").exists())

    @patch("pixelborders.views.generate_frame")
    def test_generate_design_returns_generated_pixels(self, generate_frame):
        generate_frame.return_value = {
            "name": "AI Frame",
            "width": 21,
            "height": 21,
            "palette": DEFAULT_PALETTE,
            "pixels": default_pixels(),
        }
        self.client.login(username="owner", password="pw")
        response = self.client.post(
            reverse("pixelborders:generate"),
            data=json.dumps({"description": "mossy frame", "size": 21, "variation": False}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "AI Frame")
        generate_frame.assert_called_once()

    def test_generate_design_requires_description(self):
        self.client.login(username="owner", password="pw")
        response = self.client.post(
            reverse("pixelborders:generate"),
            data=json.dumps({"description": "", "size": 21}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_generate_design_requires_login(self):
        response = self.client.post(
            reverse("pixelborders:generate"),
            data=json.dumps({"description": "mossy frame", "size": 21}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 302)

    def test_public_design_visible_in_list(self):
        PixelBorderDesign.objects.create(owner=self.owner, name="Public", is_public=True)
        PixelBorderDesign.objects.create(owner=self.owner, name="Private", is_public=False)
        response = self.client.get(reverse("pixelborders:editor"))
        self.assertContains(response, "Public")
        self.assertNotContains(response, "Private")

    def test_anonymous_can_load_public_design(self):
        design = PixelBorderDesign.objects.create(owner=self.owner, name="Public", is_public=True)
        response = self.client.get(reverse("pixelborders:load", args=[design.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Public")

    def test_anonymous_cannot_load_private_design(self):
        design = PixelBorderDesign.objects.create(owner=self.owner, name="Private", is_public=False)
        response = self.client.get(reverse("pixelborders:load", args=[design.pk]))
        self.assertEqual(response.status_code, 403)

    def test_visible_designs_are_sorted_by_name(self):
        PixelBorderDesign.objects.create(owner=self.owner, name="Zebra")
        PixelBorderDesign.objects.create(owner=self.owner, name="Alpha")
        self.client.login(username="owner", password="pw")
        response = self.client.get(reverse("pixelborders:editor"))
        content = response.content.decode()
        self.assertLess(content.index("Alpha"), content.index("Zebra"))

    def test_visible_designs_css_is_available_to_copy(self):
        PixelBorderDesign.objects.create(owner=self.owner, name="Copy Me")
        self.client.login(username="owner", password="pw")
        response = self.client.get(reverse("pixelborders:editor"))
        self.assertContains(response, "data-copy-visible-css")
        self.assertContains(response, reverse("pixelborders:visible_css"))

    def test_visible_designs_css_endpoint_includes_data_urls(self):
        PixelBorderDesign.objects.create(owner=self.owner, name="Copy Me")
        self.client.login(username="owner", password="pw")
        response = self.client.get(reverse("pixelborders:visible_css"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/css")
        content = response.content.decode()
        self.assertIn("frm-copy-me", content)
        self.assertIn("data:image/png;base64,", content)
        self.assertNotIn("__PIXEL_BORDER_IMAGE__", content)

    def test_anonymous_visible_designs_css_only_includes_public_designs(self):
        PixelBorderDesign.objects.create(owner=self.owner, name="Public Copy", is_public=True)
        PixelBorderDesign.objects.create(owner=self.owner, name="Private Copy", is_public=False)
        response = self.client.get(reverse("pixelborders:visible_css"))
        self.assertEqual(response.status_code, 200)
        content = response.content.decode()
        self.assertIn("frm-public-copy", content)
        self.assertNotIn("frm-private-copy", content)

    def test_non_owner_cannot_update_or_delete(self):
        design = PixelBorderDesign.objects.create(owner=self.owner, name="Owned")
        self.client.login(username="viewer", password="pw")
        update = self.client.post(
            reverse("pixelborders:save"),
            self.payload(design_id=str(design.pk), name="Hijacked"),
        )
        delete = self.client.post(reverse("pixelborders:delete", args=[design.pk]))
        self.assertEqual(update.status_code, 403)
        self.assertEqual(delete.status_code, 403)
