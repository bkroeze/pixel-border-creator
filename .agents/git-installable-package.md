# Package pixelborders for Git installs

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `.agents/PLANS.md` from the repository root.

## Purpose / Big Picture

The `pixelborders` Django app should be reusable from another Django project by installing this repository from a Git tag with pip or uv. After this change, the built package contains the reusable `pixelborders` app, including templates, static files, migrations, and tests, while the demo project package named `config` remains only in the source repository for local development.

## Progress

- [x] (2026-05-14T17:18:13Z) Inspected `pyproject.toml`, README, and current package discovery.
- [x] (2026-05-14T17:20:48Z) Updated package metadata and discovery for a reusable app install.
- [x] (2026-05-14T17:19:37Z) Ran the upstream Django test suite.
- [x] (2026-05-14T17:20:48Z) Built the wheel and inspected installed package contents.
- [x] (2026-05-14T17:20:48Z) Recorded validation outcome.

## Surprises & Discoveries

- Observation: The current package discovery includes both `config*` and `pixelborders*`.
  Evidence: `pyproject.toml` has `[tool.setuptools.packages.find] include = ["config*", "pixelborders*"]`.

- Observation: The first test run after changing dependency metadata needed network access to refresh the editable install.
  Evidence: Sandbox run failed while fetching `https://pypi.org/simple/django-htmx/`; the escalated rerun passed.

- Observation: Table-style `project.license` metadata builds but is deprecated in current setuptools.
  Evidence: The first wheel build emitted a `SetuptoolsDeprecationWarning`; switching to `license = "GPL-3.0-or-later"` and `license-files = ["gpl-3-0.txt"]` removed the warning.

## Decision Log

- Decision: Keep distribution name `pixel-borders` and import package `pixelborders`.
  Rationale: This preserves the Django app label, migrations, and downstream `INSTALLED_APPS` integration.
  Date/Author: 2026-05-14 / Codex

- Decision: Exclude `config*` from the installed package but leave it in the repo.
  Rationale: `config` is the demo/dev Django project and should not be imported into downstream projects through the wheel.
  Date/Author: 2026-05-14 / Codex

- Decision: Relax the Django dependency to `Django>=5.0,<7.0`.
  Rationale: The downstream project uses Django 6, and this app does not currently depend on Django internals that require `<6.0`.
  Date/Author: 2026-05-14 / Codex

## Outcomes & Retrospective

The package is ready for a `v0.1.1` Git tag. The Django test suite passes with 29 tests. The wheel builds successfully at `/tmp/pixel-borders-dist/pixel_borders-0.1.1-py3-none-any.whl`, includes `pixelborders` Python modules, templates, static files, migrations, tests, and the GPL license file, and does not include the demo `config` package.

## Context and Orientation

`pyproject.toml` controls how setuptools builds this project. Package discovery decides which Python packages are placed in the wheel. Package data decides which non-Python files inside packages, such as Django templates and static assets, are included. The reusable app package is `pixelborders`; the source repository also contains `config`, a local Django project used to run the app during development.

## Plan of Work

Update `pyproject.toml` so setuptools finds only `pixelborders*`, relax the Django version range to include Django 6, and bump the version to a tag-ready patch version. Add package metadata pointing to the license file and repository README. Keep package data for templates and static files.

Run the test suite with `UV_CACHE_DIR=/tmp/uv-cache uv run manage.py test`. Build a wheel into a temporary directory with `UV_CACHE_DIR=/tmp/uv-cache uv build --wheel --out-dir /tmp/pixel-borders-dist`, then inspect the wheel file list to confirm `pixelborders` files are present and no `config/` package files are included.

## Concrete Steps

Work from `/home/bruce/Documents/projects/pixel-borders`.

Run:

    UV_CACHE_DIR=/tmp/uv-cache uv run manage.py test
    rm -rf /tmp/pixel-borders-dist
    UV_CACHE_DIR=/tmp/uv-cache uv build --wheel --out-dir /tmp/pixel-borders-dist
    python -m zipfile -l /tmp/pixel-borders-dist/*.whl

Actual test result:

    Ran 29 tests in 9.440s
    OK

Actual wheel evidence:

    pixelborders/migrations/0001_initial.py
    pixelborders/migrations/0002_pixelborderdesign_border_repeat.py
    pixelborders/static/pixelborders/app.css
    pixelborders/static/pixelborders/editor.js
    pixelborders/templates/pixelborders/editor.html
    pixel_borders-0.1.1.dist-info/licenses/gpl-3-0.txt

The `config` package check returned no entries.

## Validation and Acceptance

The change is accepted when tests pass, the wheel contains `pixelborders/templates`, `pixelborders/static`, and `pixelborders/migrations`, and the wheel does not contain `config/__init__.py`, `config/settings.py`, or other `config` package files.

## Idempotence and Recovery

The build output is written to `/tmp/pixel-borders-dist`, which can be deleted and recreated safely. No migrations or database changes are needed.

## Artifacts and Notes

No artifacts yet.

## Interfaces and Dependencies

Downstream projects should install from a Git tag using a dependency like:

    pixel-borders @ git+https://github.com/bkroeze/pixel-border-creator.git@v0.1.1

They should keep using `pixelborders.apps.PixelbordersConfig` in `INSTALLED_APPS` and `include("pixelborders.urls")` wherever they mount the app.
