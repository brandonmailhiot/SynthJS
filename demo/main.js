import {
  Composition,
  LexError,
  ParseError,
  ResolveError,
  ValidationError,
  compileSync,
  formatError,
} from "../dist/index.js";

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

const sourceEl = document.getElementById("source");
const examplesEl = document.getElementById("examples");
const diagsEl = document.getElementById("diagnostics");
const playBtn = document.getElementById("play");
const stopBtn = document.getElementById("stop");

let currentComposition = null;

function loadExample(name) {
  sourceEl.value = examples[name] ?? "";
  showDiag("");
}

function showDiag(msg) {
  diagsEl.textContent = msg;
  if (msg) diagsEl.classList.add("visible");
  else diagsEl.classList.remove("visible");
}

examplesEl.addEventListener("change", () => loadExample(examplesEl.value));
loadExample(examplesEl.value);

playBtn.addEventListener("click", async () => {
  if (currentComposition) {
    currentComposition.stop();
    await currentComposition.destroy();
    currentComposition = null;
  }
  showDiag("");

  let ir;
  try {
    ir = compileSync(sourceEl.value);
  } catch (err) {
    if (
      err instanceof LexError ||
      err instanceof ParseError ||
      err instanceof ResolveError ||
      err instanceof ValidationError
    ) {
      showDiag(formatError(err, sourceEl.value));
    } else {
      showDiag(String(err));
    }
    return;
  }

  if (ir.diagnostics.length > 0) {
    const text = ir.diagnostics
      .map((d) => `${d.severity}: ${d.message} (line ${d.span.line})`)
      .join("\n");
    showDiag(text);
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
