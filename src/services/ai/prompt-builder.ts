/**
 * Builds the system + user prompt fed to AI providers when generating or
 * editing SynthJS DSL. Keeps a tight grammar primer + a few worked examples
 * so smaller browser models (3B-class) have enough to produce valid output.
 */

const GRAMMAR_PRIMER = `\
You write SynthJS — a text-based music DSL. Output ONLY a single fenced
code block tagged \`synth\`. Never explain. Never add commentary outside the
fence.

Cheatsheet:
- \\version "2.0", \\tempo NUM, \\time N/D, \\key c4 major
- \\use "@stdlib/instruments" / "@stdlib/drums" / "@stdlib/drums-sampled" / "@stdlib/chords" / "@stdlib/scales"
- \\instrument <name> sets the current instrument for following events
- voice <name> { ... } declares an independent timeline
- Note: <duration> <pitch> e.g. \`4 c4\` is a quarter-note c4. Sticky duration
  carries until changed. Sticky octave: bare \`d e f\` after \`c4\` inherits 4.
- Chord: \`<c3 e g b>\` (sticky octave inside chord too).
- Rest: \`r\`.
- Slide: \`2 e2 -> c3\` half-note slide.
- Articulation suffixes: . staccato, _ legato, > accent, ^ marcato.
- Dynamics: \\pp \\p \\mp \\mf \\f \\ff (set persistent volume).
- ramp(\\mp, \\f) { ... } ramps dynamics across a block.
- Effects: with reverb(channels, seconds, decay) { ... }, with delay(seconds, feedback) { ... }.
- repeat N { ... } expands a block N times.
- @cue("name") and @chance(0.0..1.0) annotate single events.
- Custom instrument:
    instrument define lead { oscillator sawtooth -7  oscillator sawtooth  oscillator sawtooth 7
      envelope adsr(0.04, 0.2, 0.75, 0.5)  filter lowpass(3500, 0.6)  gain 0.85 }
- Per-layer modifier inside an oscillator block:
    oscillator noise { envelope percussive(0.0005, 0.004) }
- pitch_sweep <semitones> <duration> applies an exponential pitch envelope.
- Stdlib drums (use after \\use "@stdlib/drums"): kick_drum snare_drum hat_closed_808
  hat_open_808 bass_drum_808 snare_drum_808 tom_low_808 tom_mid_808 tom_high_808
  clap_808 cowbell_808 rim_808 cymbal_808.
- Stdlib instruments: warm_pad lead_saw brass bass_synth bell string_pad.
`;

const EXAMPLES = `\
Example 1 — simple drum loop in E minor at 128 BPM, 4 bars:
\`\`\`synth
\\version "2.0"
\\use "@stdlib/drums"
\\tempo 128
voice kick { \\instrument kick_drum \\f repeat 4 { 4 c2 c c c } }
voice snare { \\instrument snare_drum \\mf repeat 4 { 4 r d3 r d } }
voice hats { \\instrument hat_closed_808 \\p repeat 4 { 8 r f6 r f r f r f } }
\`\`\`

Example 2 — supersaw lead with chord pad and reverb, 4 bars:
\`\`\`synth
\\version "2.0"
\\tempo 100
instrument define lead { oscillator sawtooth -7 oscillator sawtooth oscillator sawtooth 7
  envelope adsr(0.04, 0.2, 0.75, 0.5) filter lowpass(3500, 0.6) gain 0.85 }
voice pad { \\instrument bell \\mp with reverb(2, 2, 0.5) { 1 <c3 e g> 1 <a2 c e> 1 <f2 a c> 1 <g2 b d3> } }
voice melody { \\instrument lead \\mf with reverb(2, 1.4, 0.5) { 4 c5 e g a 4 g c5 e d 4 a4 c5 e f 4 d c5 b4 a } }
\`\`\`
`;

export type BuildPromptArgs = {
  /** The current full source. May be empty if generating from scratch. */
  currentSource: string;
  /** The user's natural-language instruction. */
  instruction: string;
  /**
   * Optional reference DSL. When the user demonstrates intent by editing
   * the source themselves and sending it back, it goes here so the AI uses
   * it as the new baseline instead of (or alongside) the prior source.
   */
  reference?: string;
};

export function buildPrompt({ currentSource, instruction, reference }: BuildPromptArgs): string {
  const sections: string[] = [GRAMMAR_PRIMER, EXAMPLES];

  if (currentSource.trim().length > 0) {
    sections.push(`Current composition:\n\`\`\`synth\n${currentSource.trim()}\n\`\`\``);
  }
  if (reference && reference.trim().length > 0 && reference.trim() !== currentSource.trim()) {
    sections.push(
      `User-provided reference (treat as the new baseline):\n\`\`\`synth\n${reference.trim()}\n\`\`\``,
    );
  }

  sections.push(
    `Task: ${instruction.trim()}\n\nReturn the FULL revised composition as a single \`\`\`synth fenced block. Do not omit unchanged voices.`,
  );

  return sections.join("\n\n");
}

/**
 * Extract the first \`\`\`synth code block from the model's output. Tolerates
 * extra prose on either side and tags like \`\`\`synthjs / \`\`\`. When the
 * output is truncated mid-block (no closing fence — common when the model
 * hits its token budget), returns everything after the opening fence so the
 * caller can decide whether to accept the partial result. Returns null only
 * when no opening fence appears at all.
 */
export function extractDslBlock(output: string): string | null {
  // First try a fully-closed block.
  const closed = output.match(/```(?:synth(?:js)?|)?\s*\n([\s\S]*?)\n```/);
  if (closed?.[1] !== undefined) return closed[1].trim();
  // Fall back to an open-ended block — recovers truncated streams.
  const open = output.match(/```(?:synth(?:js)?|)?\s*\n([\s\S]+)$/);
  if (open?.[1] !== undefined) return open[1].trim();
  return null;
}

/** True when the supplied output ends without a closing fence — useful for
 *  surfacing a "truncated, hit token limit" warning in the UI. */
export function isTruncated(output: string): boolean {
  if (!/```(?:synth(?:js)?|)?\s*\n/.test(output)) return false;
  const closed = output.match(/```(?:synth(?:js)?|)?\s*\n[\s\S]*?\n```/);
  return closed === null;
}
