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
  showcase: `\\version "2.0"
\\use "@stdlib/instruments"
\\use "@stdlib/drums"
\\tempo 128
\\time 4/4

// ============================================================
// 4-bar intro · 4-bar build · 16-bar drop · key of E minor
// ============================================================

/// Wide 4-saw supersaw lead — oscillator stack + lowpass.
instrument define lead_synth {
  oscillator sawtooth -10
  oscillator sawtooth -3
  oscillator sawtooth 3
  oscillator sawtooth 10
  envelope adsr(0.005, 0.15, 0.65, 0.3)
  filter lowpass(4500, 0.7)
  gain 0.7
}

/// Glassy pluck — twin triangles with chorus detune for shimmer,
/// a brief noise transient (per-layer percussive envelope) for the
/// attack click, a 2-semitone pitch ping at note start, and a
/// highpass + resonant lowpass cascade that opens the upper end
/// without muddying the lows.
instrument define pluck_synth {
  oscillator triangle
  oscillator triangle 9
  oscillator noise {
    envelope percussive(0.0005, 0.004)
  }
  envelope adsr(0.001, 0.16, 0.0, 0.08)
  pitch_sweep 2 0.02
  filter highpass(300, 0.5)
  filter lowpass(5500, 2.0)
  gain 1.3
}

/// Stabby supersaw chord pad.
instrument define stab_pad {
  oscillator sawtooth -9
  oscillator sawtooth
  oscillator sawtooth 9
  envelope adsr(0.02, 0.18, 0.55, 0.2)
  filter lowpass(2200, 0.5)
}

// ---------- DRUMS ----------
voice kick {
  \\instrument kick_drum
  \\f
  repeat 4 { 1 r }
  repeat 20 { 4 c2 c c c }
}

voice snare {
  \\instrument snare_drum
  \\mf
  /// Bars 1-7: silent
  repeat 7 { 1 r }
  /// Bar 8: 16th-note drum roll into the drop
  16 r r r r r r r r d3 d d d d d d d
  /// Bars 9-24: backbeat on 2 and 4
  repeat 16 { 4 r d3 r d }
}

voice clap {
  \\instrument clap_808
  \\mp
  repeat 8 { 1 r }
  repeat 16 { 4 r d3 r d }
}

voice hats {
  \\instrument hat_closed_808
  \\mp
  repeat 4 { 1 r }
  repeat 20 { 8 r f6 r f r f r f }
}

voice openhat {
  \\instrument hat_open_808
  \\p
  repeat 8 { 1 r }
  repeat 8 {
    2 r 4 r 8 r f6
    1 r
  }
}

// ---------- HARMONY ----------
voice pad {
  \\instrument stab_pad
  with reverb(2, 1.8, 0.5) {
    \\mp
    /// Intro chord wash
    1 <e3 g b>
    1 <c3 e g>
    1 <g3 b d4>
    1 <d3 f# a>
    /// Build — staccato stabs, dynamics ramp
    ramp(\\mp, \\f) {
      4 <e3 g b>. r <e3 g b>. r
      4 <c3 e g>. r <c3 e g>. r
      4 <g3 b d4>. r <g3 b d4>. r
      4 <d3 f# a>. r <d3 f# a>. r
    }
    /// Drop — sustained chords
    \\mf
    repeat 4 {
      1 <e3 g b>
      1 <c3 e g>
      1 <g3 b d4>
      1 <d3 f# a>
    }
  }
}

voice bass {
  \\instrument bass_synth
  /// Intro — silent bars 1-2 (pad breathes), gentle root taps bars 3-4
  \\mp
  1 r
  1 r
  2 e2 r
  4 e2 r e r
  /// Build — quarter pulses ramping into eighth syncopation
  ramp(\\mp, \\f) {
    4 c2 c c c
    4 g2 g g g
    8 e1 r e2 e e1 r e2 e
    8 d1 r d2 d d1 d2 a b
  }
  /// Drop A — bars 9-16: syncopated sub + body
  \\f
  repeat 2 {
    8 e1 r e2 e e1 r e2 e
    8 c1 r c2 c c1 r c2 c
    8 g1 r g2 g g1 r g2 g
    8 d1 r d2 d d1 r d2 d
  }
  /// Drop B — bars 17-24: walking line, passing tones, octave jumps
  repeat 2 {
    8 e1 e2 g e e1 e2 b a
    8 c1 c2 e c c1 c2 g e
    8 g1 g2 d3 g2 g1 g2 b a
    8 d1 d2 f# d d1 d2 a g
  }
}

voice pluck {
  \\instrument pluck_synth
  /// Bars 1-6: silent
  repeat 6 { 1 r }
  /// Bars 7-8: sneak in with sparse 16th figures (build fill)
  \\mp
  16 r r e4 g r r b e5 r r b4 g r r e g
  16 r r c5 b4 g e r r r r d5 b4 g e r r
  /// Phrase A (bars 9-12) — ascending 16th flurry, climbs each chord
  \\mf
  16 e4 g b e5 b4 g e g b e5 g e b4 g e g
  16 c4 e g c5 g4 e c e g c5 e c g4 e c e
  16 g4 b d5 g d b4 g b d5 g b g d b4 g b
  16 d4 f# a d5 a4 f# d f# a d5 f# d a4 f# d f#
  /// Phrase B (bars 13-16) — call-and-response with 16th + rest gaps
  16 e5 d b4 g r r e5 d b4 g r r e5 d b4 g
  16 c5 b4 g e r r c5 b4 g e r r c5 b4 g e
  16 d5 b4 g d r r d5 b4 g d r r g5 d b4 g
  16 a4 f# d a3 r r a4 f# d a3 r r d5 a4 f# d
  /// Phrase C (bars 17-20) — peak flurry, octave climb to top
  16 e4 g b e5 g b e6 b5 g e b4 g e g b e5
  16 c4 e g c5 e g c6 g5 e c g4 e c e g c5
  16 g4 b d5 g b d6 g6 d b5 g d b4 g b d5 g
  16 d4 f# a d5 f# a d6 a5 f# d a4 f# d f# a d5
  /// Phrase D (bars 21-24) — dense 16th figures, peak at g6, then a
  /// chromatic descent that mirrors the lead's chromatic ascent and
  /// resolves on e4 (Em root). Lead peaks high, pluck lands low.
  16 e5 d b4 g e g b e5 g e b4 g e g b e5
  16 c5 e g c e g c6 g5 e c g4 e c e g c5
  16 d5 g b d6 b5 g d g b d6 g6 d b5 g d g
  16 e5 d# d c# c b4 a# a g# g f# f e d# r r
}

// ---------- LEAD ----------
voice lead {
  \\instrument lead_synth
  with reverb(2, 1.4, 0.5) {
    repeat 12 { 1 r }
    \\mf
    /// Hook A — syncopated entry, descending answer
    8 r b4 r b 4 d5 e
    8 e5 d b4 a 4 g a
    8 r d5 r d 4 g 8 e d
    4 a5 g 8 e d b4 a
    /// Hook B — climb to peak, slide back, descending run
    4 b4 a g e
    8 g4 a b c5 d e g a
    1 b5 -> e5
    8 a5 g e d c b4 a g
    /// Tail — rising stutter, slide accent, chromatic spike to peak,
    /// then sudden silence while pluck + bass carry the resolution.
    8 r b4 r d5 4 e g
    8 r e5 r g 4 b a
    2 b5 -> g5 2 a
    16 g5 a b c6 c# d d# e r r r r r r r r
  }
}`,

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

  "sampled-drums": `\\version "2.0"
\\use "@stdlib/drums-sampled"
\\tempo 100
\\time 4/4

// Bundled stdlib samples — sourced from procedurally rendered 808 voices.
// Replace assets/samples/*.wav and re-run \`pnpm samples:encode\` to swap in
// real recordings; instruments below pick up whatever bytes are bundled.

voice kick {
  \\instrument kick_real
  \\f
  repeat 4 { 4 c2 r c2 r }
}

voice snare {
  \\instrument snare_real
  \\mf
  repeat 4 { 4 r d3 r d3 }
}

voice hats {
  \\instrument hat_closed_real
  \\p
  repeat 16 { 8 f6 f6 }
}

voice clap {
  \\instrument clap_real
  \\mp
  repeat 2 { 1 r 4 r d4 r r }
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
