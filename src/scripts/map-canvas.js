// <map-canvas> — wraps a map image and overlays a paint layer with a toolbar.
// Vanilla web component, no dependencies. Painting is client-side only and not
// persisted (reload = clean map). Works with mouse, touch and pen via pointer
// events. Reuses the site theme via CSS custom properties (they inherit through
// the shadow boundary).

const PALETTE = [
  { name: "Жёлтый", value: "#ffe600" },
  { name: "Зелёный", value: "#3ad13a" },
  { name: "Голубой", value: "#25c4e0" },
  { name: "Розовый", value: "#ff4fa3" },
  { name: "Оранжевый", value: "#ff8c1a" },
  { name: "Красный", value: "#ff3131" },
];

const BRUSH = { small: 18, medium: 36, large: 64 };
const STROKE_ALPHA = 0.55;

// Inline SVG icons (no emoji, per project rules). 24x24, currentColor.
const ICONS = {
  cursor: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M5 3l14 7-6 1.5L10 18 5 3z"/></svg>',
  eraser: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 16l7-7 6 6-4 4H8l-4-4z"/><path d="M13 5l6 6"/></svg>',
  clear: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
};

const STYLE = `
  :host {
    display: block;
    position: relative;
    line-height: 0;
  }
  ::slotted(img) {
    display: block;
    width: 100%;
    height: auto;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: auto;
    pointer-events: none;
  }
  :host([data-tool="paint"]) canvas,
  :host([data-tool="eraser"]) canvas {
    touch-action: none;
    pointer-events: auto;
    cursor: crosshair;
  }
  .toolbar {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    max-width: calc(100% - 16px);
    padding: 6px;
    line-height: 1;
    font-family: var(--font-sans, sans-serif);
    background: rgb(from var(--color-bg-white, #fff) r g b / 0.92);
    border: 1px solid var(--color-border, #999);
    border-radius: var(--radius-item, 8px);
    box-shadow: var(--shadow-content, 0 2px 6px rgb(0 0 0 / 0.1));
  }
  .toolbar[hidden] { display: none; }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .sep {
    width: 1px;
    align-self: stretch;
    margin: 2px 2px;
    background: var(--color-border-light, #ddd);
  }
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    color: var(--color-text, #2b1f1f);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-code, 4px);
    cursor: pointer;
  }
  button:hover { background: var(--color-bg-light, #f3f3f3); }
  button[aria-pressed="true"] {
    border-color: var(--color-border, #999);
    background: var(--color-bg-light, #f3f3f3);
  }
  .swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgb(0 0 0 / 0.25);
    box-shadow: 0 0 0 2px transparent;
  }
  .swatch[aria-pressed="true"] {
    box-shadow: 0 0 0 2px var(--color-text, #2b1f1f);
  }
  .dot {
    background: currentColor;
    border-radius: 50%;
    display: block;
  }
  .toggle {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 3;
    width: 32px;
    height: 32px;
    font-family: var(--font-sans, sans-serif);
    color: var(--color-text, #2b1f1f);
    background: rgb(from var(--color-bg-white, #fff) r g b / 0.92);
    border: 1px solid var(--color-border, #999);
    border-radius: var(--radius-code, 4px);
    box-shadow: var(--shadow-content, 0 2px 6px rgb(0 0 0 / 0.1));
    cursor: pointer;
  }
  .toggle[hidden] { display: none; }
`;

class MapCanvas extends HTMLElement {
  constructor() {
    super();
    this.tool = "cursor";
    this.color = PALETTE[0].value;
    this.brush = BRUSH.medium;
    this._drawing = false;
    this._last = null;
    // Persistent drawing surface at device-pixel resolution. The visible
    // canvas is redrawn from this so a resize never loses marks.
    this._buffer = document.createElement("canvas");
    // Per-stroke scratch layer so overlapping segments in one stroke don't
    // build up alpha into a dark blob.
    this._stroke = document.createElement("canvas");
    this._dpr = 1;
  }

  connectedCallback() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${STYLE}</style>
      <slot></slot>
      <canvas part="canvas"></canvas>
      <div class="toolbar" role="toolbar" aria-label="Инструменты карты"></div>
      <button class="toggle" type="button" hidden aria-label="Показать инструменты">${ICONS.cursor}</button>
    `;
    this.canvas = root.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.toolbar = root.querySelector(".toolbar");
    this.toggleBtn = root.querySelector(".toggle");
    this._buffer.getContext("2d"); // ensure context exists lazily below

    this._buildToolbar();
    this._setTool("cursor");

    this.toggleBtn.addEventListener("click", () => this._setToolbarHidden(false));

    this.canvas.addEventListener("pointerdown", this._onDown);
    this.canvas.addEventListener("pointermove", this._onMove);
    this.canvas.addEventListener("pointerup", this._onUp);
    this.canvas.addEventListener("pointercancel", this._onUp);

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this);

    const img = this.querySelector("img");
    if (img && !img.complete) {
      img.addEventListener("load", () => this._resize(), { once: true });
    }
    this._resize();
  }

  disconnectedCallback() {
    this._ro?.disconnect();
  }

  _buildToolbar() {
    const tb = this.toolbar;

    // Collapse the toolbar out of the way.
    const collapse = this._btn("collapse", "Скрыть инструменты",
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>');
    collapse.addEventListener("click", () => this._setToolbarHidden(true));

    // Cursor.
    this.cursorBtn = this._btn("cursor", "Курсор", ICONS.cursor);
    this.cursorBtn.addEventListener("click", () => this._setTool("cursor"));

    // Color swatches.
    const swatches = document.createElement("div");
    swatches.className = "group";
    this.swatchBtns = PALETTE.map((c) => {
      const b = this._btn("swatch", "Цвет: " + c.name);
      b.classList.add("swatch");
      b.style.background = c.value;
      b.dataset.color = c.value;
      b.addEventListener("click", () => {
        this.color = c.value;
        this._setTool("paint");
      });
      swatches.appendChild(b);
      return b;
    });

    // Eraser.
    this.eraserBtn = this._btn("eraser", "Ластик", ICONS.eraser);
    this.eraserBtn.addEventListener("click", () => this._setTool("eraser"));

    // Clear all.
    const clearBtn = this._btn("clear", "Очистить", ICONS.clear);
    clearBtn.addEventListener("click", () => this.clear());

    // Brush size (small / medium / large dots).
    const sizes = document.createElement("div");
    sizes.className = "group";
    this.sizeBtns = Object.entries(BRUSH).map(([key, px], i) => {
      const d = 6 + i * 5;
      const b = this._btn("size", "Размер кисти: " + ["малый", "средний", "большой"][i],
        `<span class="dot" style="width:${d}px;height:${d}px"></span>`);
      b.dataset.brush = String(px);
      b.addEventListener("click", () => this._setBrush(px));
      sizes.appendChild(b);
      return b;
    });

    tb.append(
      collapse, this._sep(),
      this.cursorBtn, this._sep(),
      swatches, this._sep(),
      this.eraserBtn, clearBtn, this._sep(),
      sizes,
    );

    this._setBrush(this.brush);
  }

  _btn(kind, label, html = "") {
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.kind = kind;
    b.setAttribute("aria-label", label);
    b.title = label;
    b.innerHTML = html;
    return b;
  }

  _sep() {
    const s = document.createElement("span");
    s.className = "sep";
    return s;
  }

  _setToolbarHidden(hidden) {
    this.toolbar.hidden = hidden;
    this.toggleBtn.hidden = !hidden;
  }

  _setTool(tool) {
    this.tool = tool;
    this.setAttribute("data-tool", tool);
    this.cursorBtn.setAttribute("aria-pressed", String(tool === "cursor"));
    this.eraserBtn.setAttribute("aria-pressed", String(tool === "eraser"));
    this.swatchBtns.forEach((b) => {
      b.setAttribute("aria-pressed", String(tool === "paint" && b.dataset.color === this.color));
    });
  }

  _setBrush(px) {
    this.brush = px;
    this.sizeBtns.forEach((b) => {
      b.setAttribute("aria-pressed", String(Number(b.dataset.brush) === px));
    });
  }

  _resize() {
    const w = this.clientWidth;
    const h = this.clientHeight;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);

    // Preserve existing marks by scaling the old buffer into the new size.
    const prev = this._buffer;
    const hadContent = prev.width && prev.height;
    const next = document.createElement("canvas");
    next.width = bw;
    next.height = bh;
    if (hadContent) {
      next.getContext("2d").drawImage(prev, 0, 0, bw, bh);
    }
    this._buffer = next;
    this._dpr = dpr;

    this.canvas.width = bw;
    this.canvas.height = bh;
    this._stroke.width = bw;
    this._stroke.height = bh;

    this._render();
  }

  // Copy the persistent buffer onto the visible canvas.
  _render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this._buffer, 0, 0);
  }

  // Pointer position in buffer (device) pixels.
  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width / r.width;
    const sy = this.canvas.height / r.height;
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  _onDown = (e) => {
    if (this.tool === "cursor") return;
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    this._drawing = true;
    this._last = this._pos(e);

    if (this.tool === "paint") {
      // Start a fresh scratch layer for this stroke.
      const s = this._stroke.getContext("2d");
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.clearRect(0, 0, this._stroke.width, this._stroke.height);
      s.globalCompositeOperation = "source-over";
      s.strokeStyle = this.color;
      s.fillStyle = this.color;
      s.lineCap = "round";
      s.lineJoin = "round";
      s.lineWidth = this.brush * this._dpr;
      // A dot so a tap leaves a mark.
      s.beginPath();
      s.arc(this._last.x, this._last.y, (this.brush * this._dpr) / 2, 0, Math.PI * 2);
      s.fill();
    }
    this._paintTo(this._last, true);
  };

  _onMove = (e) => {
    if (!this._drawing) return;
    e.preventDefault();
    // Coalesced events give smoother strokes on high-rate pointers.
    const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    const events = coalesced && coalesced.length ? coalesced : [e];
    for (const ev of events) this._paintTo(this._pos(ev), false);
  };

  _onUp = (e) => {
    if (!this._drawing) return;
    this._drawing = false;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    if (this.tool === "paint") {
      // Composite the whole stroke onto the buffer once, at highlighter alpha.
      const b = this._buffer.getContext("2d");
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = "source-over";
      b.globalAlpha = STROKE_ALPHA;
      b.drawImage(this._stroke, 0, 0);
      b.globalAlpha = 1;
    }
    this._last = null;
    this._render();
  };

  _paintTo(pt, isFirst) {
    if (this.tool === "eraser") {
      const b = this._buffer.getContext("2d");
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.globalCompositeOperation = "destination-out";
      b.lineCap = "round";
      b.lineJoin = "round";
      b.lineWidth = this.brush * this._dpr;
      b.beginPath();
      b.moveTo(this._last?.x ?? pt.x, this._last?.y ?? pt.y);
      b.lineTo(pt.x, pt.y);
      b.stroke();
      b.globalCompositeOperation = "source-over";
      this._last = pt;
      this._render();
      return;
    }

    // paint: extend the stroke on the scratch layer at full alpha.
    const s = this._stroke.getContext("2d");
    if (!isFirst && this._last) {
      s.beginPath();
      s.moveTo(this._last.x, this._last.y);
      s.lineTo(pt.x, pt.y);
      s.stroke();
    }
    this._last = pt;

    // Live preview: buffer + current stroke at highlighter alpha.
    this._render();
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = STROKE_ALPHA;
    ctx.drawImage(this._stroke, 0, 0);
    ctx.globalAlpha = 1;
  }

  clear() {
    const b = this._buffer.getContext("2d");
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, this._buffer.width, this._buffer.height);
    this._render();
  }
}

customElements.define("map-canvas", MapCanvas);
