# Pixel Border Creator

Pixel Border Creator is a Django web app for designing 9-patch style CSS `border-image` PNGs. It provides a reusable Django app named `pixelborders`, backed by Django auth and SQLite for local development.

Inspired by and thanks to [Broider by Max Bittker](https://maxbittker.github.io/broider/).

## Setup

From the repository root:

    python3 -m venv .venv
    . .venv/bin/activate
    pip install -e .
    python manage.py migrate
    python manage.py createsuperuser
    python manage.py runserver 127.0.0.1:8000

Open `http://127.0.0.1:8000/`, sign in, paint the grid, save a design, and click the CSS preview to copy the generated CSS.

## Tests

Run:

    . .venv/bin/activate
    python manage.py test
