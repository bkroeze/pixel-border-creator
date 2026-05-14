# Open the Pixel Borders editor for public use

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan follows `.agents/PLANS.md` from the repository root.

## Purpose / Big Picture

Pixel Border Creator currently requires a login before anyone can use the editor. After this change, a public visitor can open the editor, paint or import a frame, and save it in their own browser without creating an account. Logged-in users keep the existing database-backed save behavior. Anyone can see public database designs, logged-in users can also see their private designs, and browser-local designs are merged into the same library without duplicating entries that share a slug.

## Progress

- [x] (2026-05-14T13:46:12Z) Inspected the existing Django views, templates, tests, and editor JavaScript.
- [x] (2026-05-14T13:46:12Z) Chose `localStorage` for browser saves, server-wins duplicate precedence, and login-only AI generation.
- [x] (2026-05-14T13:50:37Z) Made editor and public design loading available without authentication.
- [x] (2026-05-14T13:50:37Z) Added topbar login/logout UI with username display.
- [x] (2026-05-14T13:50:37Z) Added browser-local save, load, merge, and copy-CSS behavior in `editor.js`.
- [x] (2026-05-14T13:50:37Z) Updated tests for public access and auth controls.
- [x] (2026-05-14T13:50:37Z) Ran the Django test suite and JavaScript syntax check.
- [x] (2026-05-14T13:50:37Z) Started the local development server and confirmed `/` returns HTTP 200.

## Surprises & Discoveries

- Observation: A complete frame definition can exceed normal browser cookie limits, especially as grid size approaches 100 by 100.
  Evidence: The payload includes `pixels`, a two-dimensional array, plus palette and metadata. The chosen browser storage is `localStorage` under `pixelborders.localDesigns.v1`.

- Observation: `uv run manage.py test` attempted to write its cache outside the writable sandbox.
  Evidence: The first test command failed with `Could not create temporary file ... Read-only file system` under `/home/bruce/.cache/uv`; rerunning with `UV_CACHE_DIR=/tmp/uv-cache` passed.

## Decision Log

- Decision: Store anonymous/browser saves in `localStorage`, not literal cookies.
  Rationale: `localStorage` can hold complete frame definitions reliably; literal cookies are too small for full pixel grids.
  Date/Author: 2026-05-14 / Codex

- Decision: Server-visible designs win when a local design and server design have the same slug.
  Rationale: Account and public database designs should remain canonical, editable/deletable server records should not be hidden by local copies, and the rule is simple to verify.
  Date/Author: 2026-05-14 / Codex

- Decision: Keep AI generation login-only.
  Rationale: Public use should allow drawing, importing, and browser saves without exposing the cost-bearing AI endpoint to anonymous traffic.
  Date/Author: 2026-05-14 / Codex

## Outcomes & Retrospective

Implemented the public editor and local browser-save behavior. The Django suite passes with 27 tests, `node --check pixelborders/static/pixelborders/editor.js` reports no syntax errors, and the local server responds with HTTP 200 at `http://127.0.0.1:8000/`.

## Context and Orientation

This is a Django app. `pixelborders/views.py` renders the editor, handles database saves, loads designs, deletes designs, returns a CSS bundle, and calls the AI generator. `pixelborders/templates/pixelborders/editor.html` owns the topbar and includes `_workspace.html`, which includes the editor panel and design library. `pixelborders/static/pixelborders/editor.js` initializes the painting UI after page load and after HTMX swaps. HTMX is a small JavaScript library used here to replace the `#workspace` element after server actions such as save and load.

A slug is the URL/class-safe name generated from a design name. The Python model enforces unique slugs per database owner. The client already has a `slugify()` helper used to keep the CSS class preview in sync with the design name.

## Plan of Work

First, make the editor view public. Change `_visible_designs(user)` so anonymous users only query public designs, and authenticated users continue to query public plus owned designs. Remove the login requirement from `editor`. Allow `load_design` for anonymous users only when the design is public. Keep `save_design`, `delete_design`, `design_list`, `visible_designs_css`, and `generate_design` protected for authenticated users, except where client-side behavior avoids calling server save for anonymous users.

Next, update `editor.html` so the topbar shows a login link for anonymous users and the username plus logout button for logged-in users. Add a data attribute to the body, such as `data-authenticated="true"` or `false`, so `editor.js` can choose server save versus local save. Change logout redirect settings to return to the public editor.

Then, update `_design_list.html` to expose each server card's slug and owner metadata to JavaScript. The JavaScript will collect server slugs, read local designs from `localStorage`, and append local cards for slugs that are not already present. A local card will use the same preview renderer by storing compatible `data-preview-state`, and will also carry a full state payload so clicking it can load the editor without a server request.

In `editor.js`, add helpers to read/write `localStorage`, build a serializable design state from the current editor, generate CSS for local designs, append local library cards, and intercept form submission for anonymous users. Anonymous save will prevent the server/HTMX request, upsert by slug, show a toast, and re-render local cards. Authenticated users keep normal server save. Loading a local design will replace the active editor form state, clear `design_id`, and preserve the ability to later save it as a database design if the user logs in.

Finally, update Django tests for the public editor behavior and run `uv run manage.py test`.

## Concrete Steps

Work from `/home/bruce/Documents/projects/pixel-borders`.

Edit the files named above using small patches. After implementation, run:

    uv run manage.py test

Expected result is all tests passing. Actual result:

    Creating test database for alias 'default'...
    ...........................
    ----------------------------------------------------------------------
    Ran 27 tests in 8.762s

    OK
    Destroying test database for alias 'default'...
    Found 27 test(s).
    System check identified no issues (0 silenced).

## Validation and Acceptance

The change is accepted when an anonymous `GET /` returns HTTP 200 and displays the editor, public designs are visible while private designs are not, and anonymous AI generation remains protected. Manual browser acceptance is that an anonymous user can paint a design, press Save, see `Design saved in this browser.`, refresh, and still see the local design in the library. If a local design shares a slug with a server design, only the server design appears. The automated tests cover the server-side access rules and auth UI; the JavaScript syntax check covers parse-level regressions in the browser-save implementation.

## Idempotence and Recovery

The code changes are additive or narrow replacements. Running the test command multiple times is safe. Browser-local saves are scoped to a versioned key, `pixelborders.localDesigns.v1`; clearing localStorage resets anonymous saved frames without touching server data.

## Artifacts and Notes

No artifacts yet.

## Interfaces and Dependencies

No new Python package dependencies are required. The browser storage key is `pixelborders.localDesigns.v1`. Local design objects should include `name`, `slug`, `cssClassName`, `width`, `height`, `palette`, `pixels`, `borderRepeat`, `isPublic`, `canEdit`, `css`, and `id`.
