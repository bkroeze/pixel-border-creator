import json

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

    def test_login_required(self):
        response = self.client.get(reverse("pixelborders:editor"))
        self.assertEqual(response.status_code, 302)

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

    def test_save_requires_square_design(self):
        self.client.login(username="owner", password="pw")
        response = self.client.post(
            reverse("pixelborders:save"),
            self.payload(width="21", height="18"),
            HTTP_HX_REQUEST="true",
        )
        self.assertEqual(response.status_code, 422)
        self.assertFalse(PixelBorderDesign.objects.filter(owner=self.owner, name="Saved Border").exists())

    def test_public_design_visible_in_list(self):
        PixelBorderDesign.objects.create(owner=self.owner, name="Public", is_public=True)
        PixelBorderDesign.objects.create(owner=self.owner, name="Private", is_public=False)
        self.client.login(username="viewer", password="pw")
        response = self.client.get(reverse("pixelborders:editor"))
        self.assertContains(response, "Public")
        self.assertNotContains(response, "Private")

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
