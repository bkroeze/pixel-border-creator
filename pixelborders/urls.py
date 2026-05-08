from django.urls import path

from . import views


app_name = "pixelborders"

urlpatterns = [
    path("", views.editor, name="editor"),
    path("designs/save/", views.save_design, name="save"),
    path("designs/generate/", views.generate_design, name="generate"),
    path("designs/css/", views.visible_designs_css, name="visible_css"),
    path("designs/<int:pk>/load/", views.load_design, name="load"),
    path("designs/<int:pk>/delete/", views.delete_design, name="delete"),
    path("designs/list/", views.design_list, name="list"),
]
