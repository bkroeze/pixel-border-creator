(function () {
  const TRANSPARENT = null;

  function parseState(form) {
    return JSON.parse(form.dataset.state);
  }

  function cssWithImage(css, imageUrl) {
    return css.replace("__PIXEL_BORDER_IMAGE__", imageUrl);
  }

  function slugify(value) {
    const slug = value.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug || "untitled";
  }

  function normalizePixels(pixels, width, height) {
    const next = [];
    for (let y = 0; y < height; y += 1) {
      const source = pixels[y] || [];
      const row = [];
      for (let x = 0; x < width; x += 1) row.push(source[x] ?? TRANSPARENT);
      next.push(row);
    }
    return next;
  }

  function addSliceGuides(grid) {
    grid.querySelectorAll(".slice-guide").forEach((guide) => guide.remove());
    [1 / 3, 2 / 3].forEach((position) => {
      const verticalGuide = document.createElement("span");
      verticalGuide.className = "slice-guide vertical";
      verticalGuide.style.left = `${position * 100}%`;
      grid.appendChild(verticalGuide);

      const horizontalGuide = document.createElement("span");
      horizontalGuide.className = "slice-guide horizontal";
      horizontalGuide.style.top = `${position * 100}%`;
      grid.appendChild(horizontalGuide);
    });
  }

  function paintCell(button, value, palette) {
    button.classList.toggle("transparent", value === TRANSPARENT);
    button.style.backgroundColor = value === TRANSPARENT ? "" : palette[value];
    button.dataset.value = value === TRANSPARENT ? "" : String(value);
  }

  function initEditor(form) {
    if (!form || form.dataset.ready === "true") return;
    form.dataset.ready = "true";

    const state = parseState(form);
    let palette = state.palette.slice();
    let pixels = normalizePixels(state.pixels, state.width, state.height);
    let active = TRANSPARENT;
    let unlocked = false;
    let drawing = false;

    const grid = form.querySelector(".pixel-grid");
    const paletteInput = form.querySelector('input[name="palette_json"]');
    const pixelsInput = form.querySelector('input[name="pixels_json"]');
    const widthInput = form.querySelector("[data-width-input]");
    const heightInput = form.querySelector("[data-height-input]");
    const widthOutput = form.querySelector("[data-width-output]");
    const heightOutput = form.querySelector("[data-height-output]");
    const cssPreview = form.querySelector(".css-preview");
    const canvas = form.querySelector(".render-canvas");
    const ctx = canvas.getContext("2d");
    const lockButton = form.querySelector(".palette-lock");
    const lockIcon = lockButton.querySelector("i");
    const nameInput = form.querySelector('input[name="name"]');
    const repeatInput = form.querySelector("[data-repeat-input]");

    function serialize() {
      paletteInput.value = JSON.stringify(palette);
      pixelsInput.value = JSON.stringify(pixels);
    }

    function renderCanvas() {
      canvas.width = pixels[0].length;
      canvas.height = pixels.length;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pixels.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell !== TRANSPARENT) {
            ctx.fillStyle = palette[cell];
            ctx.fillRect(x, y, 1, 1);
          }
        });
      });
      return canvas.toDataURL("image/png");
    }

    function updateCss() {
      const imageUrl = renderCanvas();
      const currentClass = `pixel-border-${slugify(nameInput.value)}`;
      const css = cssWithImage(state.css, imageUrl).replace(/\.pixel-border-[a-z0-9-]+ \{/, `.${currentClass} {`);
      cssPreview.textContent = css;
      cssPreview.style.borderStyle = "solid";
      cssPreview.style.borderWidth = `${Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 3))}px`;
      cssPreview.style.borderImageSource = `url("${imageUrl}")`;
      cssPreview.style.borderImageSlice = `${Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 3))} fill`;
      cssPreview.style.borderImageWidth = `${Math.max(1, Math.floor(Math.min(canvas.width, canvas.height) / 3))}px`;
      cssPreview.style.borderImageRepeat = repeatInput.value;
    }

    function updateSwatches() {
      form.querySelectorAll("[data-swatch]").forEach((button) => {
        const value = button.dataset.swatch === "transparent" ? TRANSPARENT : Number(button.dataset.swatch);
        button.classList.toggle("active", value === active);
        if (value !== TRANSPARENT) button.style.backgroundColor = palette[value];
      });
      form.querySelectorAll("[data-picker]").forEach((picker) => {
        picker.value = palette[Number(picker.dataset.picker)];
        picker.hidden = !unlocked;
      });
      lockIcon.className = unlocked ? "unlock icon" : "lock icon";
      lockButton.title = unlocked ? "Lock palette" : "Unlock palette";
    }

    function renderGrid() {
      const height = pixels.length;
      const width = pixels[0].length;
      grid.style.gridTemplateColumns = `repeat(${width}, minmax(0, 1fr))`;
      grid.innerHTML = "";
      pixels.forEach((row, y) => {
        row.forEach((cell, x) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "pixel-cell";
          button.dataset.x = String(x);
          button.dataset.y = String(y);
          paintCell(button, cell, palette);
          grid.appendChild(button);
        });
      });
      addSliceGuides(grid);
      widthOutput.value = String(width);
      heightOutput.value = String(height);
      widthInput.value = String(width);
      heightInput.value = String(height);
      serialize();
      updateCss();
    }

    function setPixel(button) {
      const x = Number(button.dataset.x);
      const y = Number(button.dataset.y);
      pixels[y][x] = active;
      paintCell(button, active, palette);
      serialize();
      updateCss();
    }

    form.querySelectorAll("[data-swatch]").forEach((button) => {
      button.addEventListener("click", () => {
        const value = button.dataset.swatch === "transparent" ? TRANSPARENT : Number(button.dataset.swatch);
        if (unlocked && value !== TRANSPARENT) {
          form.querySelector(`[data-picker="${value}"]`).click();
          return;
        }
        active = value;
        updateSwatches();
      });
    });

    form.querySelectorAll("[data-picker]").forEach((picker) => {
      picker.addEventListener("input", () => {
        palette[Number(picker.dataset.picker)] = picker.value;
        grid.querySelectorAll(".pixel-cell").forEach((cell) => {
          const value = cell.dataset.value === "" ? TRANSPARENT : Number(cell.dataset.value);
          paintCell(cell, value, palette);
        });
        serialize();
        updateSwatches();
        updateCss();
      });
    });

    lockButton.addEventListener("click", () => {
      unlocked = !unlocked;
      updateSwatches();
    });

    form.querySelector(".clear-grid").addEventListener("click", () => {
      pixels = normalizePixels([], Number(widthInput.value), Number(heightInput.value));
      renderGrid();
    });

    function resize() {
      pixels = normalizePixels(pixels, Number(widthInput.value), Number(heightInput.value));
      state.width = Number(widthInput.value);
      state.height = Number(heightInput.value);
      state.css = state.css.replace(/border-width: \d+px;/, `border-width: ${Math.max(1, Math.floor(Math.min(state.width, state.height) / 3))}px;`)
        .replace(/border-image-slice: \d+ fill;/, `border-image-slice: ${Math.max(1, Math.floor(Math.min(state.width, state.height) / 3))} fill;`)
        .replace(/border-image-width: \d+px;/, `border-image-width: ${Math.max(1, Math.floor(Math.min(state.width, state.height) / 3))}px;`);
      renderGrid();
    }

    widthInput.addEventListener("input", resize);
    heightInput.addEventListener("input", resize);
    nameInput.addEventListener("input", updateCss);
    repeatInput.addEventListener("change", () => {
      state.css = state.css.replace(/border-image-repeat: (stretch|repeat|round);/, `border-image-repeat: ${repeatInput.value};`);
      updateCss();
    });

    grid.addEventListener("pointerdown", (event) => {
      if (!event.target.classList.contains("pixel-cell")) return;
      drawing = true;
      event.target.setPointerCapture(event.pointerId);
      setPixel(event.target);
    });
    grid.addEventListener("pointerover", (event) => {
      if (drawing && event.target.classList.contains("pixel-cell")) setPixel(event.target);
    });
    window.addEventListener("pointerup", () => {
      drawing = false;
    });

    cssPreview.addEventListener("click", async () => {
      await navigator.clipboard.writeText(cssPreview.textContent);
      if (window.$ && $.toast) {
        $.toast({ message: "CSS copied.", class: "success" });
      }
    });

    updateSwatches();
    renderGrid();
  }

  function renderDesignPreview(button) {
    try {
      const state = JSON.parse(button.dataset.previewState);
      const canvas = document.createElement("canvas");
      canvas.width = state.width;
      canvas.height = state.height;
      const ctx = canvas.getContext("2d");
      state.pixels.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell !== null) {
            ctx.fillStyle = state.palette[cell];
            ctx.fillRect(x, y, 1, 1);
          }
        });
      });
      const url = canvas.toDataURL("image/png");
      button.style.borderStyle = "solid";
      button.style.borderWidth = `${state.slice}px`;
      button.style.borderImageSource = `url("${url}")`;
      button.style.borderImageSlice = `${state.slice} fill`;
      button.style.borderImageWidth = `${state.slice}px`;
      button.style.borderImageRepeat = state.repeat || "stretch";
    } catch (error) {
      console.warn("Could not render design preview", error);
    }
  }

  function initAll() {
    document.querySelectorAll("[data-pixel-editor]").forEach(initEditor);
    document.querySelectorAll(".pixel-grid").forEach(addSliceGuides);
    document.querySelectorAll("[data-preview-state]").forEach(renderDesignPreview);
  }

  document.addEventListener("DOMContentLoaded", initAll);
  document.body.addEventListener("htmx:afterSwap", initAll);
})();
