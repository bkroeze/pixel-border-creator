# Pixel Border Creator

This webapp helps create and manage the design and CSS for "9 patch" style "border-image" PNGs. This is similar to, but an extension of https://maxbittker.github.io/broider/ and the code should include a thanks to that project.

# Features
- Is a single-page webapp
- Anonymous users can save designs in their browser. Signed-in users save designs to the DB, and owning users can set their own designs to public or private, create, update, or delete them.
- allows user to name the design, this will become its css classname, slugifying if needed.
- Includes a simple HxW grid for the design editor.  Clicking on a cell turns it to the active color.
  - the selector grid starts at 21x21 (for 3 vertical and 3 horizontal "slices")
  - user can change the grid size from a minimum of 5x5 to a maximum of 100x100 by using sliders
- Editing is saved on demand, not continuously
- Has 3 color options and 1 transparent options for "colors" selectable by clicking on a square of that color, presented above the creation-grid.
  - color selector squares have a "lock" icon near them, starting locked.  Clicking the lock causes the functionality of the color selector buttons to change from click-to-select
    to instead provide a pop-up color picker, allowing the user to set the current color of that color option.  The transparent option, presented on the left of the selector row, is not overridable
- editor has a "clear all" button which resets the active design to all-pixels-transparent
- Lists all existing visible designs by name, in a grid below the creation-work area.  The grid should have spacing allowing each design to be shown with its name, framed with the design, for easy picking of designs.  Clicking on the name in the frame on the listing will load that design into the active editor.
- Has a display showing the current CSS of the active design, immediately below the editor grid.  This display is itself wrapped in the CSS for the design it is editing, thus showing the active frame-being-designed.
  - this display, when clicked, copies the CSS to the clipboard and notifies the user via a Toast that it was copied

  # Tech stack

- Build this as a Django app
  - isolate the functionality of the border maker to a Django module "pixelborders", for easy installation in another Django app.
- Use Fomantic-UI as the CSS/UI library
- Use Django-HTMX as the primary strategy for managing the workflow
