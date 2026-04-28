/**
 * Compose mode — DSL editor + transport + AI assistant.
 * Extracted from the original main.js so the app shell can mount/unmount
 * each mode independently. Receives a project handle so persistence and
 * mode switches share the same source of truth.
 */

import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { lintGutter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import {
  Composition,
  LexError,
  ParseError,
  ResolveError,
  ValidationError,
  compileSync,
  formatError,
  isolateIR,
} from "synth-javascript";
import { mountAiSidebar } from "./ai-sidebar.js";
import { synthCompletions, synthHover, synthLinter } from "./lsp-extensions.js";
import { synthLanguage } from "./synth-language.js";

export function mountComposeMode({ parent, project, onSourceChange }) {
  parent.innerHTML = `
    <div class="workspace-grid">
      <div class="workspace-left">
        <div class="panel-head">
          <span class="panel-num">EDIT</span>
          <h2 class="panel-title">source</h2>
        </div>
        <div id="editor" aria-label="SynthJS source editor"></div>
        <div class="transport-row">
          <label class="field">
            <span class="field-label">solo voice</span>
            <select id="solo">
              <option value="">all voices</option>
            </select>
          </label>
          <div class="transport-buttons">
            <button id="play" class="btn btn-primary" title="Play full composition">
              <span class="btn-glyph">▶</span><span class="btn-label">play</span>
            </button>
            <button
              id="play-selection"
              class="btn"
              title="Play only the events in the current editor selection"
            >
              <span class="btn-glyph">▶</span><span class="btn-label">selection</span>
            </button>
            <button id="stop" class="btn btn-stop">
              <span class="btn-glyph">■</span><span class="btn-label">stop</span>
            </button>
          </div>
        </div>
      </div>
      <div class="workspace-right">
        <div id="ai-panel" class="ai-panel"></div>
      </div>
    </div>
  `;

  const editorParent = parent.querySelector("#editor");
  const soloEl = parent.querySelector("#solo");
  const playBtn = parent.querySelector("#play");
  const playSelectionBtn = parent.querySelector("#play-selection");
  const stopBtn = parent.querySelector("#stop");
  const aiPanel = parent.querySelector("#ai-panel");

  let currentComposition = null;
  let editorView = null;

  const getSource = () => (editorView ? editorView.state.doc.toString() : "");

  const setSource = (text) => {
    if (!editorView) return;
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: text },
    });
    refreshSoloOptions();
  };

  function refreshSoloOptions() {
    const previous = soloEl.value;
    const source = getSource();
    let voiceNames = [];
    try {
      const ir = compileSync(source);
      voiceNames = ir.voices.map((v) => v.name);
    } catch {
      return;
    }
    soloEl.innerHTML = '<option value="">all voices</option>';
    for (const name of voiceNames) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      soloEl.appendChild(opt);
    }
    if (voiceNames.includes(previous)) soloEl.value = previous;
  }

  const buildState = (initialDoc) =>
    EditorState.create({
      doc: initialDoc,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        synthLanguage(),
        autocompletion(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
        lintGutter(),
        synthLinter(),
        synthHover(),
        synthCompletions(),
        EditorView.theme({
          "&": { fontSize: "14px", height: "100%" },
          ".cm-scroller": { fontFamily: "ui-monospace, 'SF Mono', Monaco, monospace" },
          "&.cm-focused": { outline: "none" },
        }),
        // Notify the shell whenever the source changes so it can autosave.
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onSourceChange?.(u.state.doc.toString());
        }),
      ],
    });

  editorView = new EditorView({
    state: buildState(project.source),
    parent: editorParent,
  });

  refreshSoloOptions();

  if (aiPanel) {
    mountAiSidebar({ parent: aiPanel, getSource, setSource });
  }

  function compileOrLog() {
    const source = getSource();
    try {
      return { source, ir: compileSync(source) };
    } catch (err) {
      if (
        err instanceof LexError ||
        err instanceof ParseError ||
        err instanceof ResolveError ||
        err instanceof ValidationError
      ) {
        console.error(formatError(err, source));
      } else {
        console.error(err);
      }
      return null;
    }
  }

  async function stopCurrent() {
    if (currentComposition) {
      currentComposition.stop();
      try {
        await currentComposition.destroy();
      } catch {}
      currentComposition = null;
    }
  }

  async function startPlayback(ir) {
    for (const d of ir.diagnostics) {
      console.warn(`${d.severity}: ${d.message} (line ${d.span.line})`);
    }
    if (ir.voices.length === 0 || ir.voices.every((v) => v.events.length === 0)) {
      console.warn("Nothing to play after isolation.");
      return;
    }
    currentComposition = new Composition(ir);
    await currentComposition.play();
  }

  playBtn.addEventListener("click", async () => {
    await stopCurrent();
    const result = compileOrLog();
    if (!result) return;
    refreshSoloOptions();
    let ir = result.ir;
    if (soloEl.value) ir = isolateIR(ir, { voices: [soloEl.value] });
    await startPlayback(ir);
  });

  playSelectionBtn.addEventListener("click", async () => {
    await stopCurrent();
    const result = compileOrLog();
    if (!result || !editorView) return;
    refreshSoloOptions();
    const sel = editorView.state.selection.main;
    const fromLine = editorView.state.doc.lineAt(sel.from).number;
    const toLine = editorView.state.doc.lineAt(sel.to).number;
    let ir = isolateIR(result.ir, { lineRange: [fromLine, toLine] });
    if (soloEl.value) ir = isolateIR(ir, { voices: [soloEl.value] });
    await startPlayback(ir);
  });

  stopBtn.addEventListener("click", async () => {
    await stopCurrent();
  });

  // Return a teardown so the shell can clean up when switching modes.
  return {
    getSource,
    setSource,
    destroy: async () => {
      await stopCurrent();
      editorView?.destroy();
    },
  };
}
