import json

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.http import HttpResponseBadRequest
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_http_methods, require_POST

from .css import generate_css
from .forms import PixelBorderDesignForm
from .models import DEFAULT_PALETTE, PixelBorderDesign, default_pixels


def _visible_designs(user):
    return PixelBorderDesign.objects.filter(Q(is_public=True) | Q(owner=user)).select_related("owner")


def _blank_state(user):
    design = PixelBorderDesign(
        owner=user,
        name="Untitled Border",
        slug="untitled-border",
        width=21,
        height=21,
        border_repeat="stretch",
        palette=list(DEFAULT_PALETTE),
        pixels=default_pixels(),
    )
    return design


def _editor_context(request, design=None, form=None):
    active = design or _blank_state(request.user)
    active_can_edit = active.can_edit(request.user) if active.pk else True
    return {
        "active_design": active,
        "active_can_edit": active_can_edit,
        "form": form,
        "visible_designs": _visible_designs(request.user),
        "palette_json": json.dumps(active.palette),
        "pixels_json": json.dumps(active.pixels),
        "active_design_json": json.dumps(
            {
                "id": active.pk,
                "name": active.name,
                "slug": active.slug,
                "cssClassName": active.css_class_name,
                "width": active.width,
                "height": active.height,
                "palette": active.palette,
                "pixels": active.pixels,
                "isPublic": active.is_public,
                "borderRepeat": active.border_repeat,
                "canEdit": active_can_edit,
                "css": generate_css(active),
            }
        ),
        "generated_css": generate_css(active),
    }


@login_required
def editor(request):
    return render(request, "pixelborders/editor.html", _editor_context(request))


@login_required
@require_POST
def save_design(request):
    design_id = request.POST.get("design_id")
    instance = None
    if design_id:
        instance = get_object_or_404(PixelBorderDesign, pk=design_id)
        if not instance.can_edit(request.user):
            raise PermissionDenied

    form = PixelBorderDesignForm(request.POST, owner=request.user, instance=instance)
    if not form.is_valid():
        status = 422 if request.htmx else 400
        return render(
            request,
            "pixelborders/_editor_panel.html",
            _editor_context(request, instance or _blank_state(request.user), form),
            status=status,
        )
    design = form.save()
    messages.success(request, "Design saved.")
    if request.htmx:
        return render(request, "pixelborders/_workspace.html", _editor_context(request, design))
    return redirect("pixelborders:editor")


@login_required
@require_http_methods(["GET"])
def load_design(request, pk):
    design = get_object_or_404(PixelBorderDesign, pk=pk)
    if not design.is_visible_to(request.user):
        raise PermissionDenied
    if request.htmx:
        return render(request, "pixelborders/_workspace.html", _editor_context(request, design))
    return render(request, "pixelborders/editor.html", _editor_context(request, design))


@login_required
@require_POST
def delete_design(request, pk):
    design = get_object_or_404(PixelBorderDesign, pk=pk)
    if not design.can_edit(request.user):
        raise PermissionDenied
    design.delete()
    messages.success(request, "Design deleted.")
    if request.htmx:
        return render(request, "pixelborders/_workspace.html", _editor_context(request))
    return redirect("pixelborders:editor")


@login_required
def design_list(request):
    if not request.htmx:
        return HttpResponseBadRequest("Design list is available as an HTMX fragment.")
    return render(
        request,
        "pixelborders/_design_list.html",
        {"visible_designs": _visible_designs(request.user)},
    )
