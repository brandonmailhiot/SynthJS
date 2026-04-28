/**
 * App shell — top-level orchestrator.
 *
 * Layout:
 *   ┌──────────┬────────────────────────────────┐
 *   │ LIBRARY  │ TOPBAR (mode switch · project) │
 *   │          ├────────────────────────────────┤
 *   │          │ WORKSPACE (mode-specific)      │
 *   └──────────┴────────────────────────────────┘
 *
 * Owns:
 *   - the active project (loaded from + saved to localStorage)
 *   - mode switching (live / compose / review) with smooth transitions
 *   - autosave with a yellow LED pulse when a write lands
 *
 * Each mode is mounted into the workspace pane via its own module and
 * receives a project handle + a notify-on-source-change callback so the
 * shell can persist edits without each mode caring about storage.
 */

import { mountComposeMode } from "./compose-mode.js";
import { mountLiveMode } from "./live-mode.js";
import {
  createProject,
  deleteProject,
  duplicateProject,
  ensureActiveProject,
  listProjects,
  setActiveProjectId,
  updateProject,
} from "./projects.js";
import { mountReviewMode } from "./review-mode.js";

const MODES = ["live", "compose", "review"];
const DEFAULT_MODE = "compose";
const AUTOSAVE_DEBOUNCE_MS = 600;
const SAVE_PULSE_MS = 700;

const SEED_SOURCE = `\\version "2.0"
\\use "@stdlib/instruments"
\\use "@stdlib/drums"
\\key c#4 phrygian
\\tempo 100
\\time 4/4

voice melody {
  \\instrument melody_instrument
  \\mp
  8 ^1
  4 ^3 ^4
  8 ^3 ^4
  4 ^5
  8 ^7 ^5 ^4 ^2 ^1 ^2
}

voice drums {
  \\instrument hat_closed_808
  \\p
  repeat 2 {
    8 r f6 r f r f r f
  }
}

voice kick {
  \\instrument kick_drum
  \\f
  repeat 2 {
    4 c2 c c c
  }
}

voice snare {
  \\instrument snare_drum
  \\mf
  repeat 2 {
    4 r d3 r d
  }
}

instrument define melody_instrument {
  oscillator sawtooth
  envelope adsr(0.14, 0.2, 0.75, 0.5)
  filter lowpass(3500, 0.6)
  gain 0.85
}
`;

export function mountAppShell({ root }) {
  root.innerHTML = `
    <aside class="library">
      <div class="library-head">
        <span class="library-eyebrow">projects</span>
        <button id="lib-new" class="btn btn-tiny" title="New project">
          <span class="btn-glyph">+</span>
        </button>
      </div>
      <ul id="lib-list" class="library-list" role="list"></ul>
    </aside>

    <main class="shell-main">
      <header class="topbar">
        <div class="topbar-left">
          <input
            id="project-name"
            class="project-name"
            type="text"
            spellcheck="false"
            autocomplete="off"
          />
          <span class="save-indicator" id="save-indicator" title="autosave">
            <span class="save-dot"></span>
            <span class="save-label">saved</span>
          </span>
        </div>
        <nav class="mode-switch" role="tablist" aria-label="mode">
          <span class="mode-switch-rail">
            <span class="mode-switch-thumb" id="mode-thumb"></span>
          </span>
          ${MODES.map(
            (m) => `
              <button
                class="mode-segment"
                data-mode="${m}"
                role="tab"
                aria-selected="false"
              >
                <span class="mode-num">${m === "live" ? "01" : m === "compose" ? "02" : "03"}</span>
                <span class="mode-label">${m}</span>
              </button>
            `,
          ).join("")}
        </nav>
        <div class="topbar-right">
          <span class="readout" id="readout">
            <span class="readout-label">synth</span>
            <span class="readout-value">/js</span>
          </span>
        </div>
      </header>

      <section class="workspace" id="workspace" aria-live="polite"></section>
    </main>
  `;

  const libListEl = root.querySelector("#lib-list");
  const newBtn = root.querySelector("#lib-new");
  const nameInput = root.querySelector("#project-name");
  const saveIndicator = root.querySelector("#save-indicator");
  const saveLabel = saveIndicator.querySelector(".save-label");
  const workspaceEl = root.querySelector("#workspace");
  const modeSegments = [...root.querySelectorAll(".mode-segment")];
  const modeThumb = root.querySelector("#mode-thumb");

  let activeProject = ensureActiveProject(SEED_SOURCE);
  let activeMode = DEFAULT_MODE;
  let mounted = null;
  let saveTimer = null;
  let pulseTimer = null;

  // ---------- Library list ----------

  function renderLibrary() {
    const projects = listProjects();
    libListEl.innerHTML = "";
    for (const p of projects) {
      const li = document.createElement("li");
      li.className = "library-item" + (p.id === activeProject.id ? " is-active" : "");
      li.dataset.id = p.id;
      li.innerHTML = `
        <button class="library-card" data-action="open" type="button">
          <span class="library-led" aria-hidden="true"></span>
          <span class="library-name">${escapeHtml(p.name)}</span>
          <span class="library-meta">${formatTimestamp(p.lastModified)}</span>
        </button>
        <div class="library-actions">
          <button class="btn-tiny" data-action="duplicate" title="Duplicate">
            <span class="btn-glyph">⎘</span>
          </button>
          <button class="btn-tiny" data-action="delete" title="Delete">
            <span class="btn-glyph">×</span>
          </button>
        </div>
      `;
      libListEl.appendChild(li);
    }
  }

  libListEl.addEventListener("click", async (ev) => {
    const target = ev.target.closest("[data-action]");
    if (!target) return;
    const li = target.closest(".library-item");
    if (!li) return;
    const id = li.dataset.id;
    const action = target.dataset.action;
    if (action === "open") {
      if (id === activeProject.id) return;
      await openProject(id);
    } else if (action === "duplicate") {
      const dup = duplicateProject(id);
      if (dup) {
        await openProject(dup.id);
      }
    } else if (action === "delete") {
      // Don't allow deleting the last project — the shell needs something.
      if (listProjects().length <= 1) return;
      const wasActive = id === activeProject.id;
      deleteProject(id);
      if (wasActive) {
        activeProject = ensureActiveProject(SEED_SOURCE);
        await remountActiveMode();
      }
      renderLibrary();
    }
  });

  newBtn.addEventListener("click", async () => {
    const project = createProject({ name: `untitled ${listProjects().length + 1}`, source: SEED_SOURCE });
    await openProject(project.id);
  });

  // ---------- Project name ----------

  nameInput.value = activeProject.name;
  nameInput.addEventListener("change", () => {
    const next = nameInput.value.trim() || "untitled";
    activeProject = updateProject(activeProject.id, { name: next });
    renderLibrary();
    pulseSaved();
  });

  // ---------- Autosave ----------

  function scheduleSave(nextSource) {
    if (saveTimer) clearTimeout(saveTimer);
    saveLabel.textContent = "saving…";
    saveTimer = setTimeout(() => {
      activeProject = updateProject(activeProject.id, { source: nextSource });
      pulseSaved();
      renderLibrary();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function pulseSaved() {
    saveIndicator.classList.add("is-pulsing");
    saveLabel.textContent = "saved";
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => saveIndicator.classList.remove("is-pulsing"), SAVE_PULSE_MS);
  }

  // ---------- Mode switching ----------

  function setMode(mode) {
    if (!MODES.includes(mode) || mode === activeMode) return;
    activeMode = mode;
    moveThumb(mode);
    for (const seg of modeSegments) {
      const isActive = seg.dataset.mode === mode;
      seg.classList.toggle("is-active", isActive);
      seg.setAttribute("aria-selected", isActive ? "true" : "false");
    }
    remountActiveMode();
  }

  function moveThumb(mode) {
    const idx = MODES.indexOf(mode);
    if (idx < 0) return;
    modeThumb.style.transform = `translateX(${idx * 100}%)`;
  }

  for (const seg of modeSegments) {
    seg.addEventListener("click", () => setMode(seg.dataset.mode));
  }

  async function remountActiveMode() {
    if (mounted?.destroy) {
      try {
        await mounted.destroy();
      } catch {}
      mounted = null;
    }
    workspaceEl.classList.add("is-fading");
    // micro-task fade so the swap is visible
    await new Promise((r) => setTimeout(r, 80));
    workspaceEl.innerHTML = "";
    if (activeMode === "compose") {
      mounted = mountComposeMode({
        parent: workspaceEl,
        project: activeProject,
        onSourceChange: (source) => scheduleSave(source),
      });
    } else if (activeMode === "live") {
      mounted = mountLiveMode({
        parent: workspaceEl,
        project: activeProject,
        onSourceChange: (source) => scheduleSave(source),
      });
    } else if (activeMode === "review") {
      mounted = mountReviewMode({ parent: workspaceEl, project: activeProject });
    }
    requestAnimationFrame(() => workspaceEl.classList.remove("is-fading"));
  }

  async function openProject(id) {
    setActiveProjectId(id);
    activeProject = ensureActiveProject(SEED_SOURCE);
    nameInput.value = activeProject.name;
    renderLibrary();
    await remountActiveMode();
  }

  // ---------- Boot ----------

  renderLibrary();
  moveThumb(activeMode);
  for (const seg of modeSegments) {
    if (seg.dataset.mode === activeMode) {
      seg.classList.add("is-active");
      seg.setAttribute("aria-selected", "true");
    }
  }
  remountActiveMode();
}

// ---------- helpers ----------

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatTimestamp(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toISOString().slice(0, 10);
}
