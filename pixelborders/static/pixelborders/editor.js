(function () {
  const TRANSPARENT = null;

  function parseState(form) {
    return JSON.parse(form.dataset.state);
  }

  function csrfToken(form) {
    return form.querySelector('input[name="csrfmiddlewaretoken"]').value;
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

  function sectorBounds(width, height, sector) {
    const xCuts = [0, Math.floor(width / 3), Math.floor((width * 2) / 3), width];
    const yCuts = [0, Math.floor(height / 3), Math.floor((height * 2) / 3), height];
    return {
      x1: xCuts[sector.col],
      x2: xCuts[sector.col + 1],
      y1: yCuts[sector.row],
      y2: yCuts[sector.row + 1],
    };
  }

  function sectorForCell(x, y, width, height) {
    return {
      col: x < Math.floor(width / 3) ? 0 : x < Math.floor((width * 2) / 3) ? 1 : 2,
      row: y < Math.floor(height / 3) ? 0 : y < Math.floor((height * 2) / 3) ? 1 : 2,
    };
  }

  function sameSector(left, right) {
    return left && right && left.col === right.col && left.row === right.row;
  }

  function parseBorderImport(css) {
    const classMatch = css.match(/\.([_a-zA-Z][\w-]*)\s*\{/);
    const repeatMatch = css.match(/border-image-repeat\s*:\s*(stretch|repeat|round)\s*;/i);
    const shorthandRepeatMatch = css.match(/border-image\s*:[^;]*\b(stretch|repeat|round)\b\s*;/i);
    const sliceMatch = css.match(/border-image-slice\s*:\s*(\d+)/i)
      || css.match(/border-image\s*:[^;]*\)\s*(\d+)/i);
    const sourceMatch = css.match(/border-image-source\s*:\s*url\(\s*(['"]?)(.*?)\1\s*\)/i)
      || css.match(/border-image\s*:\s*url\(\s*(['"]?)(.*?)\1\s*\)/i);
    return {
      name: classMatch ? classMatch[1] : null,
      repeat: repeatMatch ? repeatMatch[1].toLowerCase() : shorthandRepeatMatch?.[1].toLowerCase() ?? null,
      slice: sliceMatch ? Number(sliceMatch[1]) : null,
      imageUrl: sourceMatch ? sourceMatch[2] : null,
    };
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function nearestPaletteIndex(color, colors) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    colors.forEach((candidate, index) => {
      const distance = ((color[0] - candidate[0]) ** 2)
        + ((color[1] - candidate[1]) ** 2)
        + ((color[2] - candidate[2]) ** 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function pixelKey(data, width, x, y) {
    const index = (y * width + x) * 4;
    if (data[index + 3] < 128) return "transparent";
    return `${data[index]},${data[index + 1]},${data[index + 2]}`;
  }

  function isUniformBlockScale(data, width, height, scale) {
    if (width % scale !== 0 || height % scale !== 0) return false;
    for (let y = 0; y < height; y += scale) {
      for (let x = 0; x < width; x += scale) {
        const key = pixelKey(data, width, x, y);
        for (let blockY = y; blockY < y + scale; blockY += 1) {
          for (let blockX = x; blockX < x + scale; blockX += 1) {
            if (pixelKey(data, width, blockX, blockY) !== key) return false;
          }
        }
      }
    }
    return true;
  }

  function inferCssExportScale(width, height, cssSlice) {
    if (!cssSlice || width !== height || width !== cssSlice * 3) return null;
    for (const scale of [8, 6, 5, 4, 3, 2]) {
      if (cssSlice % scale === 0 && width / scale >= 5 && width / scale <= 100) return scale;
    }
    return null;
  }

  function inferImportScale(data, width, height, cssSlice) {
    const cssScale = inferCssExportScale(width, height, cssSlice);
    if (cssScale) return cssScale;

    const commonScales = [8, 6, 5, 4, 3, 2];
    const candidates = cssSlice
      ? commonScales.filter((scale) => cssSlice % scale === 0)
      : commonScales;
    for (const scale of candidates) {
      if (isUniformBlockScale(data, width, height, scale)) return scale;
    }
    return 1;
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
    let selectSectorMode = false;
    let activeSector = null;
    let copiedSector = null;

    const grid = form.querySelector(".pixel-grid");
    const designIdInput = form.querySelector('input[name="design_id"]');
    const paletteInput = form.querySelector('input[name="palette_json"]');
    const pixelsInput = form.querySelector('input[name="pixels_json"]');
    const sizeInput = form.querySelector("[data-size-input]");
    const heightInput = form.querySelector("[data-height-input]");
    const sizeOutput = form.querySelector("[data-size-output]");
    const scaleButtons = form.querySelectorAll("[data-scale-grid]");
    const cssPreview = form.querySelector(".css-preview");
    const canvas = form.querySelector(".render-canvas");
    const ctx = canvas.getContext("2d");
    const lockButton = form.querySelector(".palette-lock");
    const lockIcon = lockButton.querySelector("i");
    const nameInput = form.querySelector('input[name="name"]');
    const newDesignButton = form.querySelector("[data-new-design]");
    const repeatInput = form.querySelector("[data-repeat-input]");
    const sectorSelectButton = form.querySelector("[data-sector-select]");
    const sectorActionButtons = form.querySelectorAll("[data-sector-action]");
    const importModal = form.querySelector("[data-import-modal]");
    const importText = form.querySelector("[data-import-text]");
    const importError = form.querySelector("[data-import-error]");
    const importOpenButton = form.querySelector("[data-import-open]");
    const importCancelButton = form.querySelector("[data-import-cancel]");
    const importApplyButton = form.querySelector("[data-import-apply]");
    const importSizeLockButton = form.querySelector("[data-import-size-lock]");
    const importSizeLockIcon = importSizeLockButton.querySelector("i");
    const importSizeInput = form.querySelector("[data-import-size-input]");
    const importSizeOutput = form.querySelector("[data-import-size-output]");
    const aiModal = form.querySelector("[data-ai-modal]");
    const aiText = form.querySelector("[data-ai-text]");
    const aiError = form.querySelector("[data-ai-error]");
    const aiOpenButton = form.querySelector("[data-ai-open]");
    const aiVariationButton = form.querySelector("[data-ai-variation]");
    const aiCancelButton = form.querySelector("[data-ai-cancel]");
    const aiApplyButton = form.querySelector("[data-ai-apply]");
    let importSizeOverrideEnabled = false;
    let aiVariationMode = false;

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
      const currentClass = `frm-${slugify(nameInput.value)}`;
      const css = cssWithImage(state.css, imageUrl).replace(/\.frm-[a-z0-9-]+ \{/, `.${currentClass} {`);
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

    function updateSectorTools() {
      const hasSector = activeSector !== null;
      sectorSelectButton.classList.toggle("active", selectSectorMode);
      sectorActionButtons.forEach((button) => {
        const action = button.dataset.sectorAction;
        button.disabled = !hasSector || (action === "paste" && copiedSector === null);
      });
      grid.querySelectorAll(".pixel-cell").forEach((cell) => {
        const x = Number(cell.dataset.x);
        const y = Number(cell.dataset.y);
        const sector = sectorForCell(x, y, pixels[0].length, pixels.length);
        cell.classList.toggle("sector-active", sameSector(activeSector, sector));
      });
    }

    function updateScaleTools() {
      const width = pixels[0].length;
      const height = pixels.length;
      scaleButtons.forEach((button) => {
        const scale = Number(button.dataset.scaleGrid);
        let nextWidth = Math.round(width * scale);
        let nextHeight = Math.round(height * scale);
        let canScale = nextWidth >= 5 && nextWidth <= 100 && nextHeight >= 5 && nextHeight <= 100;
        if (scale === 0.5) canScale = canScale && width % 2 === 0 && height % 2 === 0;
        if (scale < 0.5) canScale = canScale && width % 3 === 0 && height % 3 === 0;
        button.disabled = !canScale;
      });
    }

    function activateSectorForCell(button) {
      activeSector = sectorForCell(
        Number(button.dataset.x),
        Number(button.dataset.y),
        pixels[0].length,
        pixels.length,
      );
      updateSectorTools();
    }

    function activeSectorBounds() {
      if (!activeSector) return null;
      return sectorBounds(pixels[0].length, pixels.length, activeSector);
    }

    function showImportError(message) {
      importError.textContent = message;
      importError.hidden = false;
    }

    function showAiError(message) {
      aiError.textContent = message;
      aiError.hidden = false;
    }

    function currentAiPayload() {
      return {
        name: nameInput.value,
        palette,
        pixels,
        width: pixels[0].length,
        height: pixels.length,
        borderRepeat: repeatInput.value,
      };
    }

    function updateImportSizeOverride() {
      importSizeInput.disabled = !importSizeOverrideEnabled;
      importSizeLockIcon.className = importSizeOverrideEnabled ? "unlock icon" : "lock icon";
      importSizeLockButton.title = importSizeOverrideEnabled ? "Use auto-inferred import size" : "Override import size";
      importSizeLockButton.setAttribute("aria-pressed", String(!importSizeOverrideEnabled));
      importSizeOutput.value = importSizeInput.value;
    }

    function decodeImportImage(imageUrl, cssSlice, overrideSlice) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const sourceWidth = image.naturalWidth;
          const sourceHeight = image.naturalHeight;
          if (sourceWidth > 1000 || sourceHeight > 1000) {
            reject(new Error("Imported image is too large."));
            return;
          }
          const importCanvas = document.createElement("canvas");
          importCanvas.width = sourceWidth;
          importCanvas.height = sourceHeight;
          const importContext = importCanvas.getContext("2d");
          importContext.imageSmoothingEnabled = false;
          importContext.clearRect(0, 0, sourceWidth, sourceHeight);
          importContext.drawImage(image, 0, 0);
          const data = importContext.getImageData(0, 0, sourceWidth, sourceHeight).data;
          const scale = overrideSlice ? sourceWidth / (overrideSlice * 3) : inferImportScale(data, sourceWidth, sourceHeight, cssSlice);
          if (!Number.isFinite(scale) || scale <= 0) {
            reject(new Error("Import size override is not valid for this image."));
            return;
          }
          const width = overrideSlice
            ? Math.max(5, Math.min(100, overrideSlice * 3))
            : Math.max(5, Math.min(100, Math.floor(sourceWidth / scale)));
          const height = overrideSlice
            ? Math.max(5, Math.min(100, Math.round(sourceHeight / scale)))
            : Math.max(5, Math.min(100, Math.floor(sourceHeight / scale)));
          const counts = new Map();

          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const sourceX = Math.min(sourceWidth - 1, Math.floor(x * scale));
              const sourceY = Math.min(sourceHeight - 1, Math.floor(y * scale));
              const index = (sourceY * sourceWidth + sourceX) * 4;
              if (data[index + 3] < 128) continue;
              const key = `${data[index]},${data[index + 1]},${data[index + 2]}`;
              counts.set(key, (counts.get(key) || 0) + 1);
            }
          }

          const colorTriples = Array.from(counts.entries())
            .sort((left, right) => right[1] - left[1])
            .slice(0, 3)
            .map(([key]) => key.split(",").map(Number));
          while (colorTriples.length < 3) colorTriples.push([47, 42, 34]);

          const importedPixels = [];
          for (let y = 0; y < height; y += 1) {
            const row = [];
            for (let x = 0; x < width; x += 1) {
              const sourceX = Math.min(sourceWidth - 1, Math.floor(x * scale));
              const sourceY = Math.min(sourceHeight - 1, Math.floor(y * scale));
              const index = (sourceY * sourceWidth + sourceX) * 4;
              if (data[index + 3] < 128) {
                row.push(TRANSPARENT);
              } else {
                row.push(nearestPaletteIndex([data[index], data[index + 1], data[index + 2]], colorTriples));
              }
            }
            importedPixels.push(row);
          }

          resolve({
            width,
            height,
            palette: colorTriples.map(([r, g, b]) => rgbToHex(r, g, b)),
            pixels: importedPixels,
          });
        };
        image.onerror = () => reject(new Error("Could not decode the border image data URL."));
        image.src = imageUrl;
      });
    }

    async function importBorderCss() {
      importError.hidden = true;
      const parsed = parseBorderImport(importText.value);
      if (!parsed.imageUrl) {
        showImportError("No border-image-source or border-image URL was found.");
        return;
      }

      try {
        const overrideSlice = importSizeOverrideEnabled ? Number(importSizeInput.value) : null;
        const imported = await decodeImportImage(parsed.imageUrl, parsed.slice, overrideSlice);
        markAsNewDesign();
        if (parsed.name) nameInput.value = parsed.name;
        if (parsed.repeat) {
          repeatInput.value = parsed.repeat;
          state.css = state.css.replace(/border-image-repeat: (stretch|repeat|round);/, `border-image-repeat: ${parsed.repeat};`);
        }
        palette = imported.palette;
        pixels = imported.pixels;
        activeSector = null;
        selectSectorMode = false;
        sizeInput.value = String(imported.width);
        heightInput.value = String(imported.height);
        state.width = imported.width;
        state.height = imported.height;
        const importedSlice = Math.max(1, Math.floor(Math.min(imported.width, imported.height) / 3));
        state.css = state.css.replace(/border-width: \d+px;/, `border-width: ${importedSlice}px;`)
          .replace(/border-image-slice: \d+ fill;/, `border-image-slice: ${importedSlice} fill;`)
          .replace(/border-image-width: \d+px;/, `border-image-width: ${importedSlice}px;`);
        importModal.hidden = true;
        renderGrid();
        updateSwatches();
      } catch (error) {
        showImportError(error.message);
      }
    }

    async function generateAiBorder() {
      aiError.hidden = true;
      const description = aiText.value.trim();
      if (!description) {
        showAiError("Describe the frame you want.");
        return;
      }

      aiApplyButton.disabled = true;
      const originalLabel = aiApplyButton.textContent;
      aiApplyButton.textContent = aiVariationMode ? "Varying..." : "Generating...";
      try {
        const response = await fetch(form.dataset.generateUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken(form),
          },
          body: JSON.stringify({
            description,
            size: pixels[0].length,
            variation: aiVariationMode,
            current: currentAiPayload(),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not generate a frame.");

        markAsNewDesign();
        nameInput.value = data.name || "AI Border";
        palette = data.palette;
        pixels = normalizePixels(data.pixels, data.width, data.height);
        active = TRANSPARENT;
        activeSector = null;
        copiedSector = null;
        selectSectorMode = false;
        sizeInput.value = String(data.width);
        heightInput.value = String(data.height);
        updateDesignSize(data.width, data.height);
        aiModal.hidden = true;
        renderGrid();
        updateSwatches();
      } catch (error) {
        showAiError(error.message);
      } finally {
        aiApplyButton.disabled = false;
        aiApplyButton.textContent = originalLabel;
      }
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
      sizeOutput.value = String(width);
      sizeInput.value = String(width);
      heightInput.value = String(height);
      serialize();
      updateCss();
      updateSectorTools();
      updateScaleTools();
    }

    function markAsNewDesign() {
      designIdInput.value = "";
    }

    function updateDesignSize(width, height) {
      state.width = width;
      state.height = height;
      const slice = Math.max(1, Math.floor(Math.min(width, height) / 3));
      state.css = state.css.replace(/border-width: \d+px;/, `border-width: ${slice}px;`)
        .replace(/border-image-slice: \d+ fill;/, `border-image-slice: ${slice} fill;`)
        .replace(/border-image-width: \d+px;/, `border-image-width: ${slice}px;`);
    }

    function resamplePixels(sourcePixels, width, height) {
      const sourceHeight = sourcePixels.length;
      const sourceWidth = sourcePixels[0].length;
      const next = [];
      for (let y = 0; y < height; y += 1) {
        const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / height));
        const row = [];
        for (let x = 0; x < width; x += 1) {
          const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / width));
          row.push(sourcePixels[sourceY][sourceX]);
        }
        next.push(row);
      }
      return next;
    }

    function setPixel(button) {
      activateSectorForCell(button);
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

    newDesignButton.addEventListener("click", () => {
      markAsNewDesign();
      nameInput.value = "";
      repeatInput.value = "stretch";
      state.css = state.css.replace(/border-image-repeat: (stretch|repeat|round);/, "border-image-repeat: stretch;");
      palette = ["#2f2a22", "#f2c14e", "#3f88c5"];
      pixels = normalizePixels([], 21, 21);
      active = TRANSPARENT;
      activeSector = null;
      copiedSector = null;
      selectSectorMode = false;
      sizeInput.value = "21";
      heightInput.value = "21";
      updateDesignSize(21, 21);
      renderGrid();
      updateSwatches();
    });

    form.querySelector(".clear-grid").addEventListener("click", () => {
      pixels = normalizePixels([], Number(sizeInput.value), Number(sizeInput.value));
      renderGrid();
    });

    function resize() {
      pixels = normalizePixels(pixels, Number(sizeInput.value), Number(sizeInput.value));
      updateDesignSize(Number(sizeInput.value), Number(sizeInput.value));
      renderGrid();
    }

    sizeInput.addEventListener("input", resize);
    scaleButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const scale = Number(button.dataset.scaleGrid);
        const nextWidth = Math.round(pixels[0].length * scale);
        const nextHeight = Math.round(pixels.length * scale);
        pixels = resamplePixels(pixels, nextWidth, nextHeight);
        activeSector = null;
        selectSectorMode = false;
        sizeInput.value = String(nextWidth);
        heightInput.value = String(nextHeight);
        updateDesignSize(nextWidth, nextHeight);
        renderGrid();
      });
    });
    nameInput.addEventListener("input", updateCss);
    repeatInput.addEventListener("change", () => {
      state.css = state.css.replace(/border-image-repeat: (stretch|repeat|round);/, `border-image-repeat: ${repeatInput.value};`);
      updateCss();
    });

    importSizeLockButton.addEventListener("click", () => {
      importSizeOverrideEnabled = !importSizeOverrideEnabled;
      updateImportSizeOverride();
    });

    importSizeInput.addEventListener("input", updateImportSizeOverride);

    aiOpenButton.addEventListener("click", () => {
      aiVariationMode = false;
      aiError.hidden = true;
      aiApplyButton.textContent = "Generate";
      aiModal.hidden = false;
      aiText.focus();
    });

    aiVariationButton.addEventListener("click", () => {
      aiVariationMode = true;
      aiError.hidden = true;
      aiApplyButton.textContent = "Generate variation";
      if (!aiText.value.trim()) aiText.value = `Make a variation of ${nameInput.value || "this frame"}.`;
      aiModal.hidden = false;
      aiText.focus();
    });

    aiCancelButton.addEventListener("click", () => {
      aiModal.hidden = true;
    });

    aiModal.addEventListener("click", (event) => {
      if (event.target === aiModal) aiModal.hidden = true;
    });

    aiApplyButton.addEventListener("click", generateAiBorder);

    grid.addEventListener("pointerdown", (event) => {
      if (!event.target.classList.contains("pixel-cell")) return;
      if (selectSectorMode) {
        activateSectorForCell(event.target);
        selectSectorMode = false;
        updateSectorTools();
        return;
      }
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

    sectorSelectButton.addEventListener("click", () => {
      selectSectorMode = !selectSectorMode;
      updateSectorTools();
    });

    sectorActionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const bounds = activeSectorBounds();
        if (!bounds) return;
        const width = bounds.x2 - bounds.x1;
        const height = bounds.y2 - bounds.y1;
        const action = button.dataset.sectorAction;

        if (action === "fill") {
          for (let y = bounds.y1; y < bounds.y2; y += 1) {
            for (let x = bounds.x1; x < bounds.x2; x += 1) pixels[y][x] = active;
          }
        }

        if (action === "copy") {
          copiedSector = [];
          for (let y = bounds.y1; y < bounds.y2; y += 1) {
            copiedSector.push(pixels[y].slice(bounds.x1, bounds.x2));
          }
          selectSectorMode = true;
        }

        if (action === "paste" && copiedSector) {
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const sourceY = Math.floor((y * copiedSector.length) / height);
              const sourceX = Math.floor((x * copiedSector[0].length) / width);
              pixels[bounds.y1 + y][bounds.x1 + x] = copiedSector[sourceY][sourceX];
            }
          }
          selectSectorMode = true;
        }

        if (action === "rotate-left" || action === "rotate-right") {
          const source = [];
          for (let y = bounds.y1; y < bounds.y2; y += 1) source.push(pixels[y].slice(bounds.x1, bounds.x2));
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const sourceX = action === "rotate-right"
                ? Math.floor((y * width) / height)
                : width - 1 - Math.floor((y * width) / height);
              const sourceY = action === "rotate-right"
                ? height - 1 - Math.floor((x * height) / width)
                : Math.floor((x * height) / width);
              pixels[bounds.y1 + y][bounds.x1 + x] = source[sourceY][sourceX];
            }
          }
        }

        renderGrid();
      });
    });

    importOpenButton.addEventListener("click", () => {
      importError.hidden = true;
      importSizeOverrideEnabled = false;
      importSizeInput.value = String(Math.max(1, Math.floor(Math.min(state.width, state.height) / 3)));
      updateImportSizeOverride();
      importModal.hidden = false;
      importText.focus();
    });
    importCancelButton.addEventListener("click", () => {
      importModal.hidden = true;
    });
    importModal.addEventListener("click", (event) => {
      if (event.target === importModal) importModal.hidden = true;
    });
    importApplyButton.addEventListener("click", importBorderCss);

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

  function initCopyVisibleCss(button) {
    if (button.dataset.ready === "true") return;
    button.dataset.ready = "true";
    button.addEventListener("click", async () => {
      const cssNode = button.closest(".design-list")?.querySelector('script[type="application/json"]');
      const css = cssNode ? JSON.parse(cssNode.textContent) : "";
      await navigator.clipboard.writeText(css);
      if (window.$ && $.toast) {
        $.toast({ message: "Visible designs CSS copied.", class: "success" });
      }
    });
  }

  function initAll() {
    document.querySelectorAll("[data-pixel-editor]").forEach(initEditor);
    document.querySelectorAll(".pixel-grid").forEach(addSliceGuides);
    document.querySelectorAll("[data-preview-state]").forEach(renderDesignPreview);
    document.querySelectorAll("[data-copy-visible-css]").forEach(initCopyVisibleCss);
  }

  document.addEventListener("DOMContentLoaded", initAll);
  document.body.addEventListener("htmx:afterSwap", initAll);
})();
