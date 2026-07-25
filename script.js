const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;

const stageCanvas = document.getElementById("stageCanvas");
const onionCanvas = document.getElementById("onionCanvas");
const stageCtx = stageCanvas.getContext("2d");
const onionCtx = onionCanvas.getContext("2d");
const backgroundLayer = document.getElementById("backgroundLayer");
const timelineEl = document.getElementById("timeline");
const shotHeading = document.getElementById("shotHeading");
const exportStatus = document.getElementById("exportStatus");

const panelTitleInput = document.getElementById("panelTitle");
const panelNoteInput = document.getElementById("panelNote");
const panelDurationInput = document.getElementById("panelDuration");
const brushSizeInput = document.getElementById("brushSize");
const brushColorInput = document.getElementById("brushColor");
const backgroundColorInput = document.getElementById("backgroundColor");
const backgroundUploadInput = document.getElementById("backgroundUpload");
const figurePoseInput = document.getElementById("figurePose");
const figureScaleInput = document.getElementById("figureScale");
const onionSkinToggle = document.getElementById("onionSkinToggle");

const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));

const state = {
  panels: [],
  activePanelId: null,
  selectedFigureId: null,
  activeTool: "pen",
  brushSize: Number(brushSizeInput.value),
  brushColor: brushColorInput.value,
  showOnionSkin: onionSkinToggle.checked,
  drawingStroke: null,
  dragInfo: null,
};

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultPanel() {
  return {
    id: uid("panel"),
    title: "Opening Shot",
    note: "Sketch the action beat here.",
    duration: 3,
    backgroundColor: "#f6e6b3",
    backgroundImage: "",
    lines: [],
    figures: [],
  };
}

function getActivePanel() {
  return state.panels.find((panel) => panel.id === state.activePanelId);
}

function getActivePanelIndex() {
  return state.panels.findIndex((panel) => panel.id === state.activePanelId);
}

function getSelectedFigure() {
  const panel = getActivePanel();
  if (!panel) return null;
  return panel.figures.find((figure) => figure.id === state.selectedFigureId) || null;
}

function clonePanel(panel) {
  return {
    ...cloneData(panel),
    id: uid("panel"),
    title: panel.title ? `${panel.title} Copy` : "Copied Shot",
  };
}

function createFigure(x, y) {
  return {
    id: uid("figure"),
    x,
    y,
    scale: 1,
    pose: "idle",
    flipped: false,
    color: state.brushColor,
  };
}

function pointFromEvent(event) {
  const rect = stageCanvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function slugify(value, fallback = "storyboard") {
  return (value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function setExportStatus(message) {
  exportStatus.textContent = message;
}

function setTool(tool) {
  state.activeTool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  stageCanvas.style.cursor = tool === "drag" ? "grab" : tool === "figure" ? "copy" : "crosshair";
}

function updateInputsFromPanel() {
  const panel = getActivePanel();
  if (!panel) return;

  const index = getActivePanelIndex();
  shotHeading.textContent = `Panel ${index + 1}: ${panel.title || "Untitled Shot"}`;
  panelTitleInput.value = panel.title;
  panelNoteInput.value = panel.note;
  panelDurationInput.value = panel.duration;
  backgroundColorInput.value = panel.backgroundColor;

  const figure = getSelectedFigure();
  figurePoseInput.value = figure?.pose || "idle";
  figureScaleInput.value = String(Math.round((figure?.scale || 1) * 100));
}

function syncBackground() {
  const panel = getActivePanel();
  if (!panel) return;

  backgroundLayer.style.backgroundColor = panel.backgroundColor;
  backgroundLayer.style.backgroundImage = panel.backgroundImage
    ? `linear-gradient(rgba(246, 230, 179, 0.16), rgba(246, 230, 179, 0.16)), url(${panel.backgroundImage})`
    : "none";
}

function drawStroke(ctx, stroke, alpha = 1) {
  if (!stroke.points.length) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = stroke.size;
  ctx.strokeStyle = stroke.color;
  ctx.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i += 1) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }
  if (stroke.points.length === 1) {
    ctx.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y + 0.01);
  }
  ctx.stroke();
  ctx.restore();
}

function getPoseAngles(pose) {
  switch (pose) {
    case "walk":
      return {
        leftArm: -45,
        rightArm: 45,
        leftLeg: 35,
        rightLeg: -35,
      };
    case "point":
      return {
        leftArm: -82,
        rightArm: 28,
        leftLeg: 8,
        rightLeg: -8,
      };
    case "celebrate":
      return {
        leftArm: -128,
        rightArm: 128,
        leftLeg: 20,
        rightLeg: -20,
      };
    case "idle":
    default:
      return {
        leftArm: -18,
        rightArm: 18,
        leftLeg: 12,
        rightLeg: -12,
      };
  }
}

function drawLimb(ctx, length, angleDegrees) {
  const angle = (angleDegrees * Math.PI) / 180;
  ctx.lineTo(Math.sin(angle) * length, Math.cos(angle) * length);
}

function drawStickFigure(ctx, figure, options = {}) {
  const {
    alpha = 1,
    tint = figure.color,
    emphasize = false,
    monochrome = false,
  } = options;
  const pose = getPoseAngles(figure.pose);
  const scale = figure.scale;
  const stroke = monochrome ? "rgba(35, 20, 12, 0.38)" : tint;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(figure.x, figure.y);
  ctx.scale(figure.flipped ? -scale : scale, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 6;

  if (emphasize) {
    ctx.save();
    ctx.strokeStyle = "rgba(215, 96, 43, 0.34)";
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.ellipse(0, -78, 40, 82, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(0, -116, 18, 0, Math.PI * 2);
  ctx.moveTo(0, -98);
  ctx.lineTo(0, -40);
  ctx.moveTo(0, -84);
  drawLimb(ctx, 36, pose.leftArm);
  ctx.moveTo(0, -84);
  drawLimb(ctx, 36, pose.rightArm);
  ctx.moveTo(0, -40);
  drawLimb(ctx, 48, pose.leftLeg);
  ctx.moveTo(0, -40);
  drawLimb(ctx, 48, pose.rightLeg);
  ctx.stroke();
  ctx.restore();
}

function findFigureAtPoint(panel, point) {
  for (let i = panel.figures.length - 1; i >= 0; i -= 1) {
    const figure = panel.figures[i];
    const width = 42 * figure.scale;
    const height = 140 * figure.scale;
    if (
      point.x >= figure.x - width &&
      point.x <= figure.x + width &&
      point.y >= figure.y - height &&
      point.y <= figure.y + 10
    ) {
      return figure;
    }
  }
  return null;
}

function drawMovementGuide(ctx, panel) {
  const index = getActivePanelIndex();
  if (index <= 0 || !state.selectedFigureId) return;

  const previousPanel = state.panels[index - 1];
  const previousFigure = previousPanel.figures.find(
    (figure) => figure.id === state.selectedFigureId,
  );
  const currentFigure = panel.figures.find(
    (figure) => figure.id === state.selectedFigureId,
  );

  if (!previousFigure || !currentFigure) return;

  ctx.save();
  ctx.strokeStyle = "rgba(215, 96, 43, 0.72)";
  ctx.fillStyle = "rgba(215, 96, 43, 0.72)";
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(previousFigure.x, previousFigure.y - 70 * previousFigure.scale);
  ctx.lineTo(currentFigure.x, currentFigure.y - 70 * currentFigure.scale);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(previousFigure.x, previousFigure.y - 70 * previousFigure.scale, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(currentFigure.x, currentFigure.y - 70 * currentFigure.scale, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function renderPanelScene(ctx, panel, options = {}) {
  const { alpha = 1, includeGuides = false, monochrome = false } = options;

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  panel.lines.forEach((stroke) => drawStroke(ctx, stroke, alpha));

  if (includeGuides) {
    drawMovementGuide(ctx, panel);
  }

  panel.figures.forEach((figure) =>
    drawStickFigure(ctx, figure, {
      alpha,
      emphasize: figure.id === state.selectedFigureId && !monochrome,
      monochrome,
    }),
  );
}

function renderOnionSkin() {
  onionCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (!state.showOnionSkin) return;

  const index = getActivePanelIndex();
  if (index <= 0) return;

  renderPanelScene(onionCtx, state.panels[index - 1], {
    alpha: 0.23,
    monochrome: true,
  });
}

function renderStage() {
  const panel = getActivePanel();
  if (!panel) return;

  syncBackground();
  renderOnionSkin();
  renderPanelScene(stageCtx, panel, { includeGuides: true });
  renderTimeline();
  updateInputsFromPanel();
}

async function loadPanelImages(panels) {
  return Promise.all(
    panels.map(
      (panel) =>
        new Promise((resolve) => {
          if (!panel.backgroundImage) {
            resolve(null);
            return;
          }

          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => resolve(null);
          image.src = panel.backgroundImage;
        }),
    ),
  );
}

function drawPanelFrame(ctx, panel, width, height, backgroundImage = null) {
  ctx.fillStyle = panel.backgroundColor;
  ctx.fillRect(0, 0, width, height);

  if (backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0, width, height);
  }

  ctx.save();
  ctx.scale(width / CANVAS_WIDTH, height / CANVAS_HEIGHT);
  panel.lines.forEach((stroke) => drawStroke(ctx, stroke, 1));
  panel.figures.forEach((figure) => drawStickFigure(ctx, figure, { alpha: 1 }));
  ctx.restore();
}

function downloadDataUrl(filename, dataUrl) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildThumbCanvas(panel, canvas) {
  const ctx = canvas.getContext("2d");
  canvas.width = 320;
  canvas.height = 180;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = panel.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (panel.backgroundImage) {
    const image = new Image();
    image.src = panel.backgroundImage;
    image.onload = () => {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      renderThumbOverlay();
    };
  }

  renderThumbOverlay();

  function renderThumbOverlay() {
    ctx.save();
    ctx.scale(canvas.width / CANVAS_WIDTH, canvas.height / CANVAS_HEIGHT);
    panel.lines.forEach((stroke) => drawStroke(ctx, stroke, 1));
    panel.figures.forEach((figure) => drawStickFigure(ctx, figure, { alpha: 1 }));
    ctx.restore();
  }
}

function renderTimeline() {
  timelineEl.innerHTML = "";

  state.panels.forEach((panel, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "timeline-card";
    if (panel.id === state.activePanelId) {
      card.classList.add("active");
    }

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "thumb-wrap";
    const thumbCanvas = document.createElement("canvas");
    thumbWrap.appendChild(thumbCanvas);
    buildThumbCanvas(panel, thumbCanvas);

    const meta = document.createElement("div");
    meta.className = "timeline-meta";
    const panelName = panel.title || `Panel ${index + 1}`;
    const strong = document.createElement("strong");
    strong.textContent = panelName;
    const detail = document.createElement("span");
    detail.textContent = `Panel ${index + 1} • ${panel.duration}s`;
    const note = document.createElement("p");
    note.textContent = panel.note || "No shot note yet.";
    meta.append(strong, detail, note);

    card.appendChild(thumbWrap);
    card.appendChild(meta);
    card.addEventListener("click", () => {
      state.activePanelId = panel.id;
      state.selectedFigureId = null;
      renderStage();
    });

    timelineEl.appendChild(card);
  });
}

function addPanel(mode = "blank") {
  const currentPanel = getActivePanel();
  const nextPanel = mode === "duplicate" && currentPanel ? clonePanel(currentPanel) : createDefaultPanel();
  if (mode === "blank") {
    nextPanel.title = `Panel ${state.panels.length + 1}`;
    nextPanel.note = "";
  }

  const activeIndex = getActivePanelIndex();
  state.panels.splice(activeIndex + 1, 0, nextPanel);
  state.activePanelId = nextPanel.id;
  state.selectedFigureId = null;
  renderStage();
}

function deleteActivePanel() {
  if (state.panels.length === 1) {
    const panel = getActivePanel();
    panel.lines = [];
    panel.figures = [];
    panel.note = "";
    panel.title = "Opening Shot";
    panel.backgroundColor = "#f6e6b3";
    panel.backgroundImage = "";
    renderStage();
    return;
  }

  const activeIndex = getActivePanelIndex();
  state.panels.splice(activeIndex, 1);
  const nextIndex = Math.max(0, activeIndex - 1);
  state.activePanelId = state.panels[nextIndex].id;
  state.selectedFigureId = null;
  renderStage();
}

function clearDrawing() {
  const panel = getActivePanel();
  panel.lines = [];
  renderStage();
}

function handlePointerDown(event) {
  const panel = getActivePanel();
  if (!panel) return;

  event.preventDefault();
  stageCanvas.setPointerCapture(event.pointerId);
  const point = pointFromEvent(event);
  const figure = findFigureAtPoint(panel, point);

  if (figure) {
    state.selectedFigureId = figure.id;
  }

  if (state.activeTool === "figure") {
    const newFigure = createFigure(point.x, point.y);
    panel.figures.push(newFigure);
    state.selectedFigureId = newFigure.id;
    setTool("drag");
    renderStage();
    return;
  }

  if (state.activeTool === "drag") {
    if (!figure) {
      renderStage();
      return;
    }
    state.dragInfo = {
      figureId: figure.id,
      offsetX: point.x - figure.x,
      offsetY: point.y - figure.y,
    };
    stageCanvas.style.cursor = "grabbing";
    renderStage();
    return;
  }

  state.drawingStroke = {
    mode: state.activeTool === "eraser" ? "erase" : "draw",
    color: state.brushColor,
    size: state.brushSize,
    points: [point],
  };
  panel.lines.push(state.drawingStroke);
  renderStage();
}

function handlePointerMove(event) {
  const panel = getActivePanel();
  if (!panel) return;

  event.preventDefault();
  const point = pointFromEvent(event);

  if (state.drawingStroke) {
    state.drawingStroke.points.push(point);
    renderStage();
    return;
  }

  if (state.dragInfo) {
    const figure = panel.figures.find((item) => item.id === state.dragInfo.figureId);
    if (!figure) return;
    figure.x = clamp(point.x - state.dragInfo.offsetX, 40, CANVAS_WIDTH - 40);
    figure.y = clamp(point.y - state.dragInfo.offsetY, 120, CANVAS_HEIGHT - 8);
    renderStage();
  }
}

function handlePointerUp(event) {
  if (event?.pointerId != null && stageCanvas.hasPointerCapture(event.pointerId)) {
    stageCanvas.releasePointerCapture(event.pointerId);
  }
  state.drawingStroke = null;
  state.dragInfo = null;
  stageCanvas.style.cursor = state.activeTool === "drag" ? "grab" : stageCanvas.style.cursor;
}

function handlePanelFieldChange() {
  const panel = getActivePanel();
  if (!panel) return;
  panel.title = panelTitleInput.value.trim() || "Untitled Shot";
  panel.note = panelNoteInput.value.trim();
  panel.duration = clamp(Number(panelDurationInput.value) || 1, 1, 30);
  panelDurationInput.value = panel.duration;
  renderStage();
}

function updateSelectedFigure(changes) {
  const figure = getSelectedFigure();
  if (!figure) return;
  Object.assign(figure, changes);
  renderStage();
}

function copySelectedFigure() {
  const panel = getActivePanel();
  const figure = getSelectedFigure();
  if (!panel || !figure) return;
  const newFigure = {
    ...cloneData(figure),
    id: uid("figure"),
    x: clamp(figure.x + 52, 40, CANVAS_WIDTH - 40),
  };
  panel.figures.push(newFigure);
  state.selectedFigureId = newFigure.id;
  renderStage();
}

async function exportCurrentPanel() {
  const panel = getActivePanel();
  if (!panel) return;

  const [backgroundImage] = await loadPanelImages([panel]);
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = CANVAS_WIDTH;
  exportCanvas.height = CANVAS_HEIGHT;
  const ctx = exportCanvas.getContext("2d");

  drawPanelFrame(ctx, panel, CANVAS_WIDTH, CANVAS_HEIGHT, backgroundImage);

  const filename = `${slugify(panel.title, "storyboard-shot")}.png`;
  downloadDataUrl(filename, exportCanvas.toDataURL("image/png"));
  setExportStatus(`Downloaded ${filename}. Share it like a single storyboard shot.`);
}

async function exportBoard() {
  const margin = 42;
  const columns = 2;
  const cellWidth = 1080;
  const cellHeight = 860;
  const rows = Math.ceil(state.panels.length / columns);
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = columns * cellWidth + margin * (columns + 1);
  exportCanvas.height = rows * cellHeight + margin * (rows + 1);
  const ctx = exportCanvas.getContext("2d");

  ctx.fillStyle = "#f6e7bb";
  ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  const imageCache = await loadPanelImages(state.panels);

  state.panels.forEach((panel, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (cellWidth + margin);
    const y = margin + row * (cellHeight + margin);
    const frameX = x + 26;
    const frameY = y + 82;
    const frameWidth = cellWidth - 52;
    const frameHeight = 576;

    ctx.fillStyle = "rgba(255, 250, 238, 0.95)";
    ctx.strokeStyle = "#2b190e";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(x, y, cellWidth, cellHeight, 26);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#2b190e";
    ctx.font = 'bold 34px "Trebuchet MS", sans-serif';
    ctx.fillText(`Panel ${index + 1}: ${panel.title || "Untitled Shot"}`, x + 26, y + 48);

    const bgImage = imageCache[index];
    ctx.save();
    ctx.translate(frameX, frameY);
    drawPanelFrame(ctx, panel, frameWidth, frameHeight, bgImage);
    ctx.restore();

    ctx.strokeStyle = "#2b190e";
    ctx.lineWidth = 8;
    ctx.strokeRect(frameX, frameY, frameWidth, frameHeight);

    ctx.font = '24px "Trebuchet MS", sans-serif';
    ctx.fillStyle = "#40251b";
    ctx.fillText(`Beat: ${panel.duration}s`, x + 26, y + 704);

    ctx.font = '21px "Trebuchet MS", sans-serif';
    wrapText(
      ctx,
      panel.note || "No action note.",
      x + 26,
      y + 744,
      cellWidth - 52,
      30,
    );
  });

  const filename = "storyboard-strip.png";
  downloadDataUrl(filename, exportCanvas.toDataURL("image/png"));
  setExportStatus(`Downloaded ${filename}. That one is ready to send as a full storyboard sheet.`);
}

function exportProjectFile() {
  const payload = {
    app: "Stickfigure Storyboarder",
    version: 1,
    exportedAt: new Date().toISOString(),
    activePanelId: state.activePanelId,
    panels: cloneData(state.panels),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const filename = "stickfigure-storyboarder-project.json";
  downloadBlob(filename, blob);
  setExportStatus(`Downloaded ${filename}. Share it as the editable project backup.`);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/);
  let line = "";
  let cursorY = y;

  words.forEach((word) => {
    const testLine = `${line}${word} `;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, cursorY);
      line = `${word} `;
      cursorY += lineHeight;
    } else {
      line = testLine;
    }
  });

  if (line) {
    ctx.fillText(line.trim(), x, cursorY);
  }
}

function wireControls() {
  toolButtons.forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  brushSizeInput.addEventListener("input", () => {
    state.brushSize = Number(brushSizeInput.value);
  });

  brushColorInput.addEventListener("input", () => {
    state.brushColor = brushColorInput.value;
  });

  [panelTitleInput, panelNoteInput, panelDurationInput].forEach((element) => {
    element.addEventListener("input", handlePanelFieldChange);
  });

  backgroundColorInput.addEventListener("input", () => {
    const panel = getActivePanel();
    panel.backgroundColor = backgroundColorInput.value;
    renderStage();
  });

  backgroundUploadInput.addEventListener("change", () => {
    const [file] = backgroundUploadInput.files;
    const panel = getActivePanel();
    if (!file || !panel) return;
    const reader = new FileReader();
    reader.onload = () => {
      panel.backgroundImage = String(reader.result);
      renderStage();
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("clearBackground").addEventListener("click", () => {
    const panel = getActivePanel();
    panel.backgroundImage = "";
    backgroundUploadInput.value = "";
    renderStage();
  });

  document.getElementById("addPanel").addEventListener("click", () => addPanel("blank"));
  document.getElementById("duplicatePanel").addEventListener("click", () => addPanel("duplicate"));
  document.getElementById("deletePanel").addEventListener("click", deleteActivePanel);
  document.getElementById("clearDrawing").addEventListener("click", clearDrawing);
  document.getElementById("exportPanel").addEventListener("click", exportCurrentPanel);
  document.getElementById("exportBoard").addEventListener("click", exportBoard);
  document.getElementById("exportProject").addEventListener("click", exportProjectFile);

  figurePoseInput.addEventListener("input", () => {
    updateSelectedFigure({ pose: figurePoseInput.value });
  });

  figureScaleInput.addEventListener("input", () => {
    updateSelectedFigure({ scale: Number(figureScaleInput.value) / 100 });
  });

  document.getElementById("flipFigure").addEventListener("click", () => {
    const figure = getSelectedFigure();
    if (!figure) return;
    updateSelectedFigure({ flipped: !figure.flipped });
  });

  document.getElementById("duplicateFigure").addEventListener("click", copySelectedFigure);
  document.getElementById("deleteFigure").addEventListener("click", () => {
    const panel = getActivePanel();
    if (!panel || !state.selectedFigureId) return;
    panel.figures = panel.figures.filter((figure) => figure.id !== state.selectedFigureId);
    state.selectedFigureId = null;
    renderStage();
  });

  onionSkinToggle.addEventListener("change", () => {
    state.showOnionSkin = onionSkinToggle.checked;
    renderStage();
  });

  stageCanvas.addEventListener("pointerdown", handlePointerDown);
  stageCanvas.addEventListener("pointermove", handlePointerMove);
  stageCanvas.addEventListener("pointerup", handlePointerUp);
  stageCanvas.addEventListener("pointerleave", handlePointerUp);
  stageCanvas.addEventListener("pointercancel", handlePointerUp);
}

function init() {
  state.panels = [createDefaultPanel()];
  state.activePanelId = state.panels[0].id;
  wireControls();
  setTool("pen");
  renderStage();
}

init();
