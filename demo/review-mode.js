/**
 * Review mode — placeholder. Full build (DAW timeline, VexFlow sheet
 * music, source view tabs) lands in PRs 24-25.
 *
 * Placeholder shows three "screens" stacked like instrument panels: each
 * is a dark canvas with an LED-style label and a hint at what it will
 * become. Compiles the project and surfaces a summary so the page still
 * teaches the user what their composition contains.
 */

import { compileSync } from "synth-javascript";

export function mountReviewMode({ parent, project }) {
  let summary = "";
  try {
    const ir = compileSync(project.source);
    const totalEvents = ir.voices.reduce((s, v) => s + v.events.length, 0);
    const totalBeats = ir.voices.reduce((max, v) => {
      const last = v.events[v.events.length - 1];
      return last ? Math.max(max, last.startBeat + last.durationBeats) : max;
    }, 0);
    const seconds = ((totalBeats * 4 * 60) / ir.tempo).toFixed(1);
    summary = `
      <dl class="review-summary">
        <div><dt>tempo</dt><dd>${ir.tempo} bpm</dd></div>
        <div><dt>time</dt><dd>${ir.timeSig.numerator}/${ir.timeSig.denominator}</dd></div>
        <div><dt>voices</dt><dd>${ir.voices.length}</dd></div>
        <div><dt>events</dt><dd>${totalEvents}</dd></div>
        <div><dt>length</dt><dd>${seconds}s</dd></div>
      </dl>
    `;
  } catch (err) {
    summary = `<p class="review-error">composition didn't compile · ${escapeHtml(err?.message ?? "unknown")}</p>`;
  }

  parent.innerHTML = `
    <div class="placeholder-mode review-placeholder">
      <div class="panel-head">
        <span class="panel-num">REVIEW</span>
        <h2 class="panel-title">visualize · coming soon</h2>
      </div>
      ${summary}
      <div class="review-screens">
        <div class="review-screen">
          <span class="screen-label">DAW timeline</span>
          <span class="screen-hint">piano-roll grid per voice with click-to-inspect events</span>
        </div>
        <div class="review-screen">
          <span class="screen-label">sheet music</span>
          <span class="screen-hint">VexFlow notation rendered per voice with bar markers</span>
        </div>
        <div class="review-screen">
          <span class="screen-label">source</span>
          <span class="screen-hint">read-only SynthJS source with hover metadata</span>
        </div>
      </div>
    </div>
  `;

  return { destroy: () => {} };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
