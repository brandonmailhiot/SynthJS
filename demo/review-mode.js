/**
 * Review mode — visualize the composition.
 *
 * Tabs:
 *   01 / TIMELINE   — DAW-style piano-roll per voice on a beat grid (this PR)
 *   02 / SHEET      — VexFlow notation per voice (placeholder, PR 25)
 *   03 / SOURCE     — read-only DSL source view (placeholder, PR 25/26)
 *
 * Timeline uses one HTML canvas per voice, scaled by devicePixelRatio for
 * crisp lines. Each voice picks its own pitch range so short voices don't
 * waste vertical space. Hover/click an event to show its metadata in the
 * inspector pane on the right.
 */

import { compileSync } from "synth-javascript";

const PIXELS_PER_BEAT = 32; // 1 beat = 32 px (whole note = 128 px)
const VOICE_HEIGHT = 144; // height of each voice canvas in CSS px
const VOICE_PADDING = 12; // top/bottom padding inside the canvas
const MIN_VOICE_BARS = 4; // never draw fewer than this many bars

// Distinct voice colors — hover-friendly, high-contrast against cream.
const VOICE_COLORS = [
  "#ffd400", // TE yellow
  "#ff7a1a", // warm orange
  "#3a8a4a", // green
  "#2a7ad2", // blue
  "#d23b2a", // red
  "#9b5cd6", // purple
  "#1aa6a6", // teal
  "#c97a3b", // burnt
];

export function mountReviewMode({ parent, project }) {
  let ir;
  try {
    ir = compileSync(project.source);
  } catch (err) {
    parent.innerHTML = `
      <div class="placeholder-mode review-placeholder">
        <div class="panel-head">
          <span class="panel-num">REVIEW</span>
          <h2 class="panel-title">composition won't compile</h2>
        </div>
        <pre class="review-error">${escapeHtml(err?.message ?? String(err))}</pre>
        <p class="placeholder-blurb">Switch to compose mode and fix the diagnostics; review needs a clean IR to render.</p>
      </div>
    `;
    return { destroy: () => {} };
  }

  parent.innerHTML = `
    <div class="review-shell">
      <header class="review-tabs">
        <button class="review-tab is-active" data-tab="timeline">
          <span class="mode-num">01</span><span class="mode-label">timeline</span>
        </button>
        <button class="review-tab" data-tab="sheet">
          <span class="mode-num">02</span><span class="mode-label">sheet</span>
        </button>
        <button class="review-tab" data-tab="source">
          <span class="mode-num">03</span><span class="mode-label">source</span>
        </button>
      </header>
      <section class="review-tab-pane" id="review-pane"></section>
    </div>
  `;

  const paneEl = parent.querySelector("#review-pane");
  let activeTab = "timeline";
  let resizeHandler = null;

  for (const tab of parent.querySelectorAll(".review-tab")) {
    tab.addEventListener("click", () => {
      const next = tab.dataset.tab;
      if (next === activeTab) return;
      activeTab = next;
      for (const t of parent.querySelectorAll(".review-tab")) {
        t.classList.toggle("is-active", t.dataset.tab === activeTab);
      }
      renderTab();
    });
  }

  function renderTab() {
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      resizeHandler = null;
    }
    if (activeTab === "timeline") renderTimeline();
    else if (activeTab === "sheet") renderSheetPlaceholder();
    else renderSourcePlaceholder();
  }

  // ---------- Timeline (piano-roll per voice) ----------

  function renderTimeline() {
    const totalBeats = Math.max(
      MIN_VOICE_BARS * (ir.timeSig?.numerator ?? 4),
      computeTotalBeats(ir),
    );
    const tsDen = ir.timeSig?.denominator ?? 4;
    const beatsPerBar = (ir.timeSig?.numerator ?? 4);
    const wholeNotesTotal = totalBeats / tsDen;
    const totalQuarterBeats = wholeNotesTotal * 4; // pixel grid is per-quarter
    const widthPx = totalQuarterBeats * PIXELS_PER_BEAT;

    paneEl.innerHTML = `
      <div class="timeline-summary">
        <span class="readout-eyebrow">timeline</span>
        <span class="readout-strong">${ir.tempo} bpm · ${beatsPerBar}/${tsDen} · ${ir.voices.length} voices</span>
      </div>
      <div class="timeline-scroller">
        <div class="timeline-stack" id="timeline-stack" style="min-width: ${widthPx + 96}px;"></div>
      </div>
      <aside class="timeline-inspector" id="timeline-inspector">
        <div class="panel-head"><span class="panel-num">INFO</span><h2 class="panel-title">event details</h2></div>
        <p class="timeline-inspector-empty">click an event to inspect</p>
      </aside>
    `;

    const stack = paneEl.querySelector("#timeline-stack");
    const inspector = paneEl.querySelector("#timeline-inspector");

    ir.voices.forEach((voice, voiceIdx) => {
      const color = VOICE_COLORS[voiceIdx % VOICE_COLORS.length];
      const track = document.createElement("div");
      track.className = "timeline-track";
      track.innerHTML = `
        <div class="timeline-track-head" style="border-left-color: ${color};">
          <span class="timeline-track-led" style="background: ${color};"></span>
          <div class="timeline-track-meta">
            <span class="timeline-track-name">${escapeHtml(voice.name)}</span>
            <span class="timeline-track-detail">${voice.events.length} events · ${voice.events[0]?.instrument.name ?? "—"}</span>
          </div>
        </div>
        <div class="timeline-track-canvas-wrap"></div>
      `;
      const canvasWrap = track.querySelector(".timeline-track-canvas-wrap");
      const canvas = document.createElement("canvas");
      canvasWrap.appendChild(canvas);
      stack.appendChild(track);

      const drawCanvas = () => {
        drawVoice(canvas, voice, {
          color,
          totalQuarterBeats,
          widthPx,
          tsNum: beatsPerBar,
          tsDen,
        });
      };

      drawCanvas();

      canvas.addEventListener("click", (ev) => {
        const rect = canvas.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const y = ev.clientY - rect.top;
        const event = hitTest(canvas, voice, x, y, { totalQuarterBeats, widthPx });
        if (event) {
          showInspector(inspector, voice, event, ir);
        }
      });
    });

    // Re-draw canvases on resize so they always span full pane width.
    resizeHandler = () => {
      for (const c of stack.querySelectorAll("canvas")) {
        // Force redraw via dataset roundtrip
        const ev = new Event("redraw");
        c.dispatchEvent(ev);
      }
    };
    window.addEventListener("resize", resizeHandler);
  }

  function renderSheetPlaceholder() {
    paneEl.innerHTML = `
      <div class="placeholder-mode">
        <div class="panel-head">
          <span class="panel-num">SHEET</span>
          <h2 class="panel-title">vexflow notation · coming next</h2>
        </div>
        <p class="placeholder-blurb">
          Per-voice staff rendering with bar markers, key signature, dynamic
          markings inline, and articulation symbols. Lands in PR 25.
        </p>
      </div>
    `;
  }

  function renderSourcePlaceholder() {
    paneEl.innerHTML = `
      <div class="placeholder-mode">
        <div class="panel-head">
          <span class="panel-num">SOURCE</span>
          <h2 class="panel-title">read-only inspect view · coming next</h2>
        </div>
        <p class="placeholder-blurb">
          A read-only mirror of the SynthJS source with hover-metadata
          tooltips and click-to-jump in the timeline view.
        </p>
        <pre class="review-error" style="white-space: pre-wrap; color: var(--ink); border-color: var(--rule); background: var(--bg-tint);">${escapeHtml(project.source)}</pre>
      </div>
    `;
  }

  // ---------- Boot ----------
  renderTab();
  return {
    destroy: () => {
      if (resizeHandler) window.removeEventListener("resize", resizeHandler);
    },
  };
}

// =====================================================================
// Drawing
// =====================================================================

/** Convert IR durationBeats (whole-note fractions) into "quarter beats". */
function toQuarterBeats(wholeNoteFraction) {
  return wholeNoteFraction * 4;
}

function computeTotalBeats(ir) {
  const tsDen = ir.timeSig?.denominator ?? 4;
  let max = 0;
  for (const voice of ir.voices) {
    for (const e of voice.events) {
      const end = e.startBeat + e.durationBeats;
      if (end > max) max = end;
    }
  }
  // Convert from whole-notes to "denominator beats" (e.g. 4 for 4/4).
  return max * tsDen;
}

function pitchRange(voice) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let hasPitched = false;
  for (const e of voice.events) {
    for (const f of e.frequencies) {
      if (typeof f !== "number" || !Number.isFinite(f) || f <= 0) continue;
      hasPitched = true;
      const m = freqToMidi(f);
      if (m < min) min = m;
      if (m > max) max = m;
    }
  }
  if (!hasPitched) {
    // Drum / noise / sample voices — give the canvas a small default range
    return { min: 60, max: 72 };
  }
  // Pad by a couple semitones top + bottom for breathing room
  return { min: Math.floor(min) - 2, max: Math.ceil(max) + 2 };
}

function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

function drawVoice(canvas, voice, { color, totalQuarterBeats, widthPx, tsNum }) {
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = widthPx;
  const cssHeight = VOICE_HEIGHT;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = "#14130f";
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  // Beat + bar grid
  const beatPx = PIXELS_PER_BEAT;
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let q = 0; q <= totalQuarterBeats; q++) {
    const x = q * beatPx + 0.5; // crisp 1px line
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssHeight);
    ctx.stroke();
  }
  // Bar lines: every tsNum quarter-beats. Brighter.
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  for (let b = 0; b <= totalQuarterBeats; b += tsNum) {
    const x = b * beatPx + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssHeight);
    ctx.stroke();
  }

  const range = pitchRange(voice);
  const span = Math.max(1, range.max - range.min);
  const usableHeight = cssHeight - VOICE_PADDING * 2;

  // Events
  for (const e of voice.events) {
    const xStart = toQuarterBeats(e.startBeat) * beatPx;
    const widthBeats = Math.max(1, toQuarterBeats(e.durationBeats) * beatPx);
    if (e.frequencies.length === 0) {
      // Rest — faint dashed marker
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(xStart + 1, cssHeight / 2);
      ctx.lineTo(xStart + widthBeats - 1, cssHeight / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      continue;
    }
    for (const freq of e.frequencies) {
      if (typeof freq !== "number" || !Number.isFinite(freq) || freq <= 0) continue;
      const midi = freqToMidi(freq);
      const yPos = cssHeight - VOICE_PADDING - ((midi - range.min) / span) * usableHeight;
      const noteH = Math.max(6, usableHeight / span - 2);
      // Filled rect; alpha tint scales with gain so loud notes pop more.
      const alpha = 0.45 + Math.min(0.55, e.gain * 0.55);
      ctx.fillStyle = applyAlpha(color, alpha);
      ctx.fillRect(xStart, yPos - noteH / 2, Math.max(2, widthBeats - 1), noteH);
      // Highlight stripe on top edge for definition
      ctx.fillStyle = applyAlpha(color, Math.min(1, alpha + 0.18));
      ctx.fillRect(xStart, yPos - noteH / 2, Math.max(2, widthBeats - 1), 1);
    }
  }
}

function hitTest(canvas, voice, x, y, { totalQuarterBeats }) {
  // Find an event whose bounding box contains (x, y). Approximate — match
  // any event whose horizontal span covers x and whose pitch row is within
  // a few pixels of y. Returns the closest such event.
  const cssHeight = VOICE_HEIGHT;
  const usableHeight = cssHeight - VOICE_PADDING * 2;
  const range = pitchRange(voice);
  const span = Math.max(1, range.max - range.min);
  const beatPx = PIXELS_PER_BEAT;
  let best = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const e of voice.events) {
    const xStart = toQuarterBeats(e.startBeat) * beatPx;
    const xEnd = xStart + Math.max(1, toQuarterBeats(e.durationBeats) * beatPx);
    if (x < xStart || x > xEnd) continue;
    if (e.frequencies.length === 0) continue;
    for (const freq of e.frequencies) {
      if (typeof freq !== "number" || !Number.isFinite(freq) || freq <= 0) continue;
      const midi = freqToMidi(freq);
      const yPos = cssHeight - VOICE_PADDING - ((midi - range.min) / span) * usableHeight;
      const dy = Math.abs(y - yPos);
      if (dy < 14 && dy < bestDist) {
        best = e;
        bestDist = dy;
      }
    }
  }
  return best;
}

function showInspector(inspector, voice, event, ir) {
  const tempo = ir.tempo;
  const seconds = ((event.startBeat * 4 * 60) / tempo).toFixed(3);
  const durSeconds = ((event.durationBeats * 4 * 60) / tempo).toFixed(3);
  const tsNum = ir.timeSig?.numerator ?? 4;
  const tsDen = ir.timeSig?.denominator ?? 4;
  const barLen = tsNum / tsDen;
  const bar = Math.floor(event.startBeat / barLen + 1e-9) + 1;
  const beat = (event.startBeat % barLen) * tsDen + 1;
  const freqs = event.frequencies
    .map((f) => (typeof f === "number" ? `${f.toFixed(2)} Hz` : "—"))
    .join(", ");
  const articulation = event.articulation.length ? event.articulation.join(" ") : "—";
  const fxChain = event.fxChain.map((fx) => `${fx.name}(${fx.args.positional.join(", ")})`).join(" → ") || "—";
  inspector.innerHTML = `
    <div class="panel-head"><span class="panel-num">INFO</span><h2 class="panel-title">event details</h2></div>
    <dl class="inspector-list">
      <div><dt>voice</dt><dd>${escapeHtml(voice.name)}</dd></div>
      <div><dt>position</dt><dd>bar ${bar}, beat ${beat % 1 === 0 ? beat : beat.toFixed(2)} (${seconds}s)</dd></div>
      <div><dt>duration</dt><dd>${event.durationBeats} wn (${durSeconds}s)</dd></div>
      <div><dt>frequencies</dt><dd>${freqs}</dd></div>
      <div><dt>volume</dt><dd>${event.gain.toFixed(2)}</dd></div>
      <div><dt>instrument</dt><dd>${escapeHtml(event.instrument.name)}</dd></div>
      <div><dt>articulation</dt><dd>${escapeHtml(articulation)}</dd></div>
      <div><dt>fx chain</dt><dd>${escapeHtml(fxChain)}</dd></div>
      ${event.slideTo ? `<div><dt>slide to</dt><dd>${event.slideTo.map((f) => f.toFixed(2)).join(", ")} Hz</dd></div>` : ""}
      ${event.annotations.length ? `<div><dt>annotations</dt><dd>${event.annotations.map((a) => `${a.name}(${a.args.join(", ")})`).join(", ")}</dd></div>` : ""}
    </dl>
  `;
}

// =====================================================================
// Helpers
// =====================================================================

function applyAlpha(hex, alpha) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
