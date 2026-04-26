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
import { synthCompletions, synthHover, synthLinter } from "./lsp-extensions.js";
import { synthLanguage } from "./synth-language.js";

const examples = {
  scale: `\\version "2.0"
\\tempo 120
\\key c4 major
voice melody {
  4 ^1 ^2 ^3 ^4 ^5 ^6 ^7 ^8
}`,

  chords: `\\version "2.0"
\\use "@stdlib/chords"
\\tempo 100
voice piano {
  triad_major(c4)
  triad_minor(a3)
  triad_major(f3)
  triad_major(g3)
}`,

  "two-voice": `\\version "2.0"
\\tempo 90
\\time 4/4

voice bass {
  4 c2 c2 g2 g2
}

voice melody {
  with reverb(2, 1, 0.7) {
    8 c5 d5 e5 f5  4 g5  8 f5 e5
    2 r
  }
}`,

  "custom-instrument": `\\version "2.0"
\\use "@stdlib/instruments"
\\use "@stdlib/drums"
\\tempo 80
\\time 4/4

// Pad: brass on a Cmaj7 -> Am7 -> Fmaj7 -> G7 progression, twice
voice pad {
  \\instrument brass
  \\mp
  1 <c3 e3 g3 b3>
  1 <a2 c3 e3 g3>
  1 <f2 a2 c3 e3>
  1 <g2 b2 d3 f3>
  1 <c3 e3 g3 b3>
  1 <a2 c3 e3 g3>
  1 <f2 a2 c3 e3>
  1 <g2 b2 d3 f3>
}

// Walking bass on chord roots
voice bass {
  \\instrument bass_synth
  \\mf
  4 c2 c2 g2 c3
  4 a1 a1 e2 a2
  4 f1 f1 c2 f2
  4 g1 g1 d2 g2
  4 c2 c2 g2 c3
  4 a1 a1 e2 a2
  4 f1 f1 c2 f2
  4 g1 g1 d2 g2
}

// 808 kick on 1 and 3
voice kick {
  \\instrument bass_drum_808
  \\f
  repeat 8 { 4 c2 r c2 r }
}

// 808 snare backbeat on 2 and 4
voice snare {
  \\instrument snare_drum_808
  \\mf
  repeat 8 { 4 r d3 r d3 }
}

// 808 closed hats on every eighth
voice hats {
  \\instrument hat_closed_808
  \\p
  repeat 32 { 8 f6 f6 }
}

// 808 open hat accent at end of each bar
voice hat_open {
  \\instrument hat_open_808
  \\mp
  repeat 8 { 2 r 4 r 8 r f6 }
}

// 808 cowbell — sparse syncopated accent
voice perc {
  \\instrument cowbell_808
  \\mp
  repeat 4 { 2 r 4 r g5 }
}

// Bell melody — sparse first half, fills out second half
voice melody {
  \\instrument bell
  \\mp
  2 r 2 e5
  4 d5 c5 b4 a4
  2 r 4 a4 c5
  4 e5 d5 c5 b4
  4 a4 c5 e5 g5
  4 a5 g5 e5 c5
  4 d5 c5 b4 a4
  1 c5
}`,

  slide: `\\version "2.0"
\\tempo 60
voice glide {
  2 e2 -> c3
  2 c3 -> f4
  8 f4 -> d3
}`,

  dynamics: `\\version "2.0"
\\tempo 110

voice melody {
  ramp(\\p, \\ff) {
    8 c4 d e f g a b c5
  }
  \\mf 4 d5 c5 b4 a4
  ramp(\\mf, \\pp) {
    2 g4 f4 e4
  }
}`,
};

const examplesEl = document.getElementById("examples");
const soloEl = document.getElementById("solo");
const playBtn = document.getElementById("play");
const playSelectionBtn = document.getElementById("play-selection");
const stopBtn = document.getElementById("stop");
const editorParent = document.getElementById("editor");

let currentComposition = null;
let editorView = null;

function refreshSoloOptions() {
  // Best-effort: parse the current source and populate the solo dropdown
  // with whatever voice names compile cleanly. Preserve current selection.
  const previous = soloEl.value;
  const source = getSource();
  let voiceNames = [];
  try {
    const ir = compileSync(source);
    voiceNames = ir.voices.map((v) => v.name);
  } catch {
    // Leave dropdown as-is on parse error
    return;
  }
  soloEl.innerHTML = '<option value="">All voices</option>';
  for (const name of voiceNames) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    soloEl.appendChild(opt);
  }
  if (voiceNames.includes(previous)) {
    soloEl.value = previous;
  }
}

function buildState(initialDoc) {
  return EditorState.create({
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
        "&": { fontSize: "14px", height: "400px" },
        ".cm-scroller": { fontFamily: "ui-monospace, 'SF Mono', Monaco, monospace" },
        "&.cm-focused": { outline: "none" },
      }),
    ],
  });
}

function loadExample(name) {
  const doc = examples[name] ?? "";
  if (editorView) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: doc },
    });
  }
}

editorView = new EditorView({
  state: buildState(examples[examplesEl.value]),
  parent: editorParent,
});

examplesEl.addEventListener("change", () => {
  loadExample(examplesEl.value);
  refreshSoloOptions();
});

function getSource() {
  return editorView ? editorView.state.doc.toString() : "";
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
    await currentComposition.destroy();
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
  if (soloEl.value) {
    ir = isolateIR(ir, { voices: [soloEl.value] });
  }
  await startPlayback(ir);
});

playSelectionBtn.addEventListener("click", async () => {
  await stopCurrent();
  const result = compileOrLog();
  if (!result || !editorView) return;
  refreshSoloOptions();
  // Determine selected line range from the editor (1-indexed lines).
  const sel = editorView.state.selection.main;
  const fromLine = editorView.state.doc.lineAt(sel.from).number;
  const toLine = editorView.state.doc.lineAt(sel.to).number;
  let ir = isolateIR(result.ir, { lineRange: [fromLine, toLine] });
  if (soloEl.value) {
    ir = isolateIR(ir, { voices: [soloEl.value] });
  }
  await startPlayback(ir);
});

stopBtn.addEventListener("click", async () => {
  await stopCurrent();
});

// Populate solo options once the initial example is loaded.
refreshSoloOptions();
