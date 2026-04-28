/**
 * Render an IR voice to a VexFlow staff. The mapping is intentionally
 * pragmatic: we surface what musicians need at a glance — pitches,
 * durations, rests, chord stacks, bar lines, time + key signatures —
 * without trying to round-trip every DSL feature into engraved notation.
 *
 * Limitations (acceptable for v1):
 *   - Notes are quantized to the nearest representable note value
 *     (whole/half/quarter/eighth/sixteenth/thirty-second + dotted forms).
 *   - Events that span bar boundaries are split with separate notes
 *     instead of true ties.
 *   - Triplets / tuplets are approximated by the closest non-tuplet value.
 *   - Slides + pitch sweeps render only the source pitch.
 */

import { Accidental, Dot, Formatter, Renderer, Stave, StaveNote, Voice } from "vexflow";

const NOTE_VALUES = [
  // [whole-note fraction, vexflow duration code, dotted? ]
  [1.0, "w", false],
  [0.75, "h", true],
  [0.5, "h", false],
  [0.375, "q", true],
  [0.25, "q", false],
  [0.1875, "8", true],
  [0.125, "8", false],
  [0.09375, "16", true],
  [0.0625, "16", false],
  [0.046875, "32", true],
  [0.03125, "32", false],
];

const NOTE_LETTERS = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];

/**
 * Render a single voice's events into the supplied container element.
 * Returns the SVG width used so the caller can size the surrounding pane.
 */
export function renderVoiceStaff(container, voice, ir, opts = {}) {
  const tsNum = ir.timeSig?.numerator ?? 4;
  const tsDen = ir.timeSig?.denominator ?? 4;
  const barLengthInWholeNotes = tsNum / tsDen;
  const measures = splitIntoMeasures(voice, barLengthInWholeNotes);

  if (measures.length === 0) {
    container.innerHTML = `<p class="sheet-empty">no notes in this voice</p>`;
    return;
  }

  // Decide treble vs bass clef based on the median pitch of the voice.
  const clef = pickClef(voice);

  // Lay out measures left-to-right; wrap to a new system every N bars based
  // on the available width. Width-per-measure is conservative so dense
  // sixteenth-note voices have room.
  const baseMeasureWidth = 220;
  const minSystemBars = 1;
  const maxSystemBars = Math.max(minSystemBars, Math.floor((opts.maxWidth ?? 980) / baseMeasureWidth));

  // Split measures into systems (rows of bars).
  const systems = [];
  for (let i = 0; i < measures.length; i += maxSystemBars) {
    systems.push(measures.slice(i, i + maxSystemBars));
  }

  const totalWidth = Math.min(
    opts.maxWidth ?? 980,
    baseMeasureWidth * Math.min(maxSystemBars, measures.length) + 80,
  );
  const systemHeight = 130;
  const totalHeight = systemHeight * systems.length + 24;

  container.innerHTML = ""; // clear
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(totalWidth, totalHeight);
  const ctx = renderer.getContext();
  ctx.setFont("Inter Tight", 11);

  systems.forEach((system, sysIdx) => {
    const y = sysIdx * systemHeight + 4;
    const widthPerMeasure = (totalWidth - 60) / system.length;
    let x = 16;
    system.forEach((measure, idx) => {
      const isFirst = sysIdx === 0 && idx === 0;
      const stave = new Stave(x, y, widthPerMeasure);
      if (isFirst) {
        stave.addClef(clef);
        stave.addTimeSignature(`${tsNum}/${tsDen}`);
      }
      stave.setContext(ctx).draw();

      const notes = measureToNotes(measure, clef, tsDen);
      if (notes.length > 0) {
        const voiceObj = new Voice({ num_beats: tsNum, beat_value: tsDen, resolution: 16384 });
        voiceObj.setStrict(false);
        voiceObj.addTickables(notes);
        new Formatter().joinVoices([voiceObj]).format([voiceObj], widthPerMeasure - 32);
        voiceObj.draw(ctx, stave);
      }
      x += widthPerMeasure;
    });
  });
}

// ---------------------------------------------------------------------------
// Measure splitting
// ---------------------------------------------------------------------------

function splitIntoMeasures(voice, barLengthInWholeNotes) {
  // Group events by their starting measure. Events that cross bar boundaries
  // get truncated to the bar end + a follow-up note in the next bar.
  const measures = []; // measures[i] = [{startInBar, durationBeats, frequencies, ...}]

  for (const event of voice.events) {
    let remaining = event.durationBeats;
    let cursor = event.startBeat;
    while (remaining > 1e-9) {
      const measureIdx = Math.floor(cursor / barLengthInWholeNotes + 1e-9);
      const measureStart = measureIdx * barLengthInWholeNotes;
      const measureEnd = measureStart + barLengthInWholeNotes;
      const startInBar = cursor - measureStart;
      const fitsInBar = Math.min(remaining, measureEnd - cursor);
      while (measures.length <= measureIdx) measures.push([]);
      measures[measureIdx].push({
        startInBar,
        durationBeats: fitsInBar,
        frequencies: event.frequencies,
        articulation: event.articulation,
      });
      cursor += fitsInBar;
      remaining -= fitsInBar;
    }
  }

  // Pad measures with trailing rests so each one totals barLength.
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    m.sort((a, b) => a.startInBar - b.startInBar);
    fillGapsWithRests(m, barLengthInWholeNotes);
  }
  return measures;
}

function fillGapsWithRests(measure, barLengthInWholeNotes) {
  const filled = [];
  let cursor = 0;
  for (const ev of measure) {
    if (ev.startInBar > cursor + 1e-9) {
      filled.push({
        startInBar: cursor,
        durationBeats: ev.startInBar - cursor,
        frequencies: [],
        articulation: [],
      });
    }
    filled.push(ev);
    cursor = ev.startInBar + ev.durationBeats;
  }
  if (cursor < barLengthInWholeNotes - 1e-9) {
    filled.push({
      startInBar: cursor,
      durationBeats: barLengthInWholeNotes - cursor,
      frequencies: [],
      articulation: [],
    });
  }
  measure.length = 0;
  measure.push(...filled);
}

// ---------------------------------------------------------------------------
// Note conversion
// ---------------------------------------------------------------------------

function measureToNotes(measure, clef, tsDen) {
  const notes = [];
  for (const ev of measure) {
    const pieces = quantizeDuration(ev.durationBeats);
    for (const [vfDur, dotted] of pieces) {
      const note = makeNote(ev.frequencies, vfDur, dotted, clef);
      if (note) notes.push(note);
    }
  }
  return notes;
}

function makeNote(freqs, vfDur, dotted, clef) {
  if (freqs.length === 0) {
    const rest = new StaveNote({
      keys: [clef === "bass" ? "d/3" : "b/4"],
      duration: `${vfDur}r`,
      clef,
    });
    if (dotted) Dot.buildAndAttach([rest]);
    return rest;
  }
  const filtered = freqs.filter((f) => typeof f === "number" && Number.isFinite(f) && f > 0);
  if (filtered.length === 0) return null;
  const keys = filtered.map(freqToVexKey);
  const note = new StaveNote({
    keys,
    duration: vfDur,
    clef,
    auto_stem: true,
  });
  // Add any necessary accidentals based on the keys we constructed.
  keys.forEach((k, i) => {
    if (k.includes("##")) note.addModifier(new Accidental("##"), i);
    else if (k.includes("#")) note.addModifier(new Accidental("#"), i);
    else if (k.includes("bb")) note.addModifier(new Accidental("bb"), i);
    else if (k.match(/^[a-g]b\//)) note.addModifier(new Accidental("b"), i);
  });
  if (dotted) Dot.buildAndAttach([note], { all: true });
  return note;
}

/**
 * Greedy-decompose a duration in whole-note fractions into a sequence of
 * representable VexFlow values. e.g. 0.375 → [["q", true]] (dotted quarter)
 * or 0.4 → [["q", true], … ] (dotted quarter + sixteenth).
 *
 * For values smaller than a 32nd we floor to a 32nd; for values larger than
 * a whole we emit multiple whole notes back-to-back.
 */
function quantizeDuration(dur) {
  const out = [];
  let remaining = dur;
  let safety = 32;
  while (remaining > 0.015625 && safety-- > 0) {
    let matched = null;
    for (const [frac, code, dotted] of NOTE_VALUES) {
      if (remaining + 1e-6 >= frac) {
        matched = [code, dotted];
        remaining -= frac;
        break;
      }
    }
    if (!matched) break;
    out.push(matched);
  }
  if (out.length === 0) {
    // Fallback for very short durations — treat as a 32nd note.
    return [["32", false]];
  }
  return out;
}

function freqToVexKey(freq) {
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const noteIdx = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_LETTERS[noteIdx]}/${octave}`;
}

function pickClef(voice) {
  const midis = [];
  for (const e of voice.events) {
    for (const f of e.frequencies) {
      if (typeof f === "number" && Number.isFinite(f) && f > 0) {
        midis.push(69 + 12 * Math.log2(f / 440));
      }
    }
  }
  if (midis.length === 0) return "treble";
  midis.sort((a, b) => a - b);
  const median = midis[Math.floor(midis.length / 2)];
  return median < 60 ? "bass" : "treble";
}
