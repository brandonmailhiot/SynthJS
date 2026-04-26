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
} from "synth-javascript";
import { synthCompletions, synthHover, synthLinter } from "./lsp-extensions.js";

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
\\tempo 60
\\instrument warm_pad
voice pad {
  1 <c3 e3 g3 b3>
  1 <a2 c3 e3 g3>
  1 <f2 a2 c3 e3>
  1 <g2 b2 d3 f3>
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
const playBtn = document.getElementById("play");
const stopBtn = document.getElementById("stop");
const editorParent = document.getElementById("editor");

let currentComposition = null;
let editorView = null;

function buildState(initialDoc) {
  return EditorState.create({
    doc: initialDoc,
    extensions: [
      lineNumbers(),
      history(),
      highlightActiveLine(),
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

examplesEl.addEventListener("change", () => loadExample(examplesEl.value));

function getSource() {
  return editorView ? editorView.state.doc.toString() : "";
}

playBtn.addEventListener("click", async () => {
  if (currentComposition) {
    currentComposition.stop();
    await currentComposition.destroy();
    currentComposition = null;
  }

  const source = getSource();
  let ir;
  try {
    ir = compileSync(source);
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
    return;
  }

  for (const d of ir.diagnostics) {
    console.warn(`${d.severity}: ${d.message} (line ${d.span.line})`);
  }

  currentComposition = new Composition(ir);
  await currentComposition.play();
});

stopBtn.addEventListener("click", async () => {
  if (currentComposition) {
    currentComposition.stop();
    await currentComposition.destroy();
    currentComposition = null;
  }
});
