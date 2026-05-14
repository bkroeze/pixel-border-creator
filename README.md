# Pixel Border Creator

## Purpose

Pixel Border Creator is a Django web app for designing 9-patch style CSS `border-image` PNGs. It provides a reusable Django app named `pixelborders`, backed by Django auth and SQLite for local development.

Inspired by and thanks to [Broider by Max Bittker](https://maxbittker.github.io/broider/).

## License

Copyright (C) 2026, Bruce Kroeze

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.

## Screenshot

![Screenshot](docs/screenshot.png)

## Setup

From the repository root:

    python3 -m venv .venv
    . .venv/bin/activate
    pip install -e .
    python manage.py migrate
    python manage.py createsuperuser
    python manage.py runserver 127.0.0.1:8000

Open `http://127.0.0.1:8000/`, paint the grid, and save a design. Anonymous saves stay in this browser; signed-in saves are stored in the database. Click the CSS preview to copy the active design CSS, or use the library copy button to copy CSS for all visible public, owned, and browser-local designs. The direct `designs/css/` export downloads CSS for public designs anonymously, plus owned designs when signed in.

## Install as a Django app

Install from a Git tag:

    pip install "pixel-borders @ git+https://github.com/bkroeze/pixel-border-creator.git@v0.1.1"

Add `django_htmx` and `pixelborders.apps.PixelbordersConfig` to `INSTALLED_APPS`, add `django_htmx.middleware.HtmxMiddleware` to `MIDDLEWARE`, include `pixelborders.urls` wherever you want to mount the editor, and run migrations:

    python manage.py migrate pixelborders

The host project must also provide Django auth routes named `login` and `logout`, such as `django.contrib.auth.views.LoginView` and `LogoutView`, because the editor links to those route names and authenticated saves use Django's login redirect.

## Tests

Run:

    . .venv/bin/activate
    python manage.py test
