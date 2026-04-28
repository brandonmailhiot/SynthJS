/**
 * Live mode — placeholder. The full build (loop transport + per-voice
 * mute/solo grid + AI "suggest a part" hot-reload) lands in PR 23.
 *
 * The placeholder still feels deliberate: hardware-style sequencer pads
 * laid out in a grid, dimmed to indicate "not yet wired", with a single
 * pulsing yellow LED as a hint that something is alive.
 */

export function mountLiveMode({ parent, project }) {
  parent.innerHTML = `
    <div class="placeholder-mode live-placeholder">
      <div class="panel-head">
        <span class="panel-num">LIVE</span>
        <h2 class="panel-title">performance · coming soon</h2>
        <span class="status-led status-led--idle" title="awaiting next release"></span>
      </div>
      <div class="placeholder-grid">
        ${Array.from({ length: 16 })
          .map(
            (_, i) => `<button class="pad" disabled aria-label="pad ${i + 1}">
              <span class="pad-num">${(i + 1).toString().padStart(2, "0")}</span>
            </button>`,
          )
          .join("")}
      </div>
      <p class="placeholder-blurb">
        loop the current composition · mute, solo, transpose voices on the
        fly · ask the assistant to drop a fill at the next downbeat ·
        record performances back into your project.
      </p>
      <p class="placeholder-meta">project: <strong>${escapeHtml(project.name)}</strong></p>
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
