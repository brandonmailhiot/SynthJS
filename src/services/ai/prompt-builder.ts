/**
 * Builds the system + user prompt fed to AI providers when generating or
 * editing SynthJS DSL. Keeps a tight grammar primer + a few worked examples
 * so smaller browser models (3B-class) have enough to produce valid output.
 */

/**
 * Static system prompt — grammar primer + worked examples. Kept compact so
 * KV-cache reuse on subsequent turns stays cheap and first-token latency
 * is fast even on browser-local models.
 */
const SYSTEM_PROMPT = `\
You write SynthJS, a text-based music DSL. Output ONLY one fenced \`\`\`synth\
 block. No prose.

Grammar:
- Header: \\version "2.0"; \\tempo N; \\time N/D; \\key c4 major
- Imports: \\use "@stdlib/{drums,drums-sampled,instruments,chords,scales}"
- Voice: voice NAME { ... }; \\instrument NAME sets current instrument
- Notes: DUR PITCH (e.g. 4 c4 = quarter c4). Sticky duration + sticky octave (bare d e f after c4 inherit 4). Chords: <c3 e g b>. Rest: r.
- Slide: 2 e2 -> c3. Articulations: . staccato, _ legato, > accent, ^ marcato.
- Dynamics: \\pp \\p \\mp \\mf \\f \\ff. ramp(\\p, \\f) { ... } interpolates.
- Effects: with reverb(channels, seconds, decay) { ... }; with delay(seconds, feedback) { ... }.
- Loops: repeat N { ... }. Annotations: @cue("name"), @chance(0..1).
- Custom instrument: instrument define NAME { oscillator KIND [DETUNE_C] [{ envelope ... }]  envelope adsr(a,d,s,r)  filter lowpass(cut,q)  pitch_sweep SEMI DUR  detune CENTS  gain X }
- IMPORTANT: an "instrument define" block ONLY contains those field declarations. NEVER put musical events, notes, chords, dynamics, repeat, with, ramp, or \\instrument inside an instrument define. Those belong in voice { ... } blocks. Each field appears at most once except oscillator and filter (multiple allowed for stacks/chains).
- Stdlib drums: kick_drum snare_drum hat_closed_808 hat_open_808 bass_drum_808 snare_drum_808 tom_low/mid/high_808 clap_808 cowbell_808 rim_808 cymbal_808.
- Stdlib instruments: warm_pad lead_saw brass bass_synth bell string_pad.

Example A — drum loop:
\`\`\`synth
\\version "2.0"
\\use "@stdlib/drums"
\\tempo 128
voice kick { \\instrument kick_drum \\f repeat 4 { 4 c2 c c c } }
voice snare { \\instrument snare_drum \\mf repeat 4 { 4 r d3 r d } }
voice hats { \\instrument hat_closed_808 \\p repeat 4 { 8 r f6 r f r f r f } }
\`\`\`

Example B — pad + supersaw lead with reverb:
\`\`\`synth
\\version "2.0"
\\tempo 100
instrument define lead { oscillator sawtooth -7 oscillator sawtooth oscillator sawtooth 7 envelope adsr(0.04, 0.2, 0.75, 0.5) filter lowpass(3500, 0.6) gain 0.85 }
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

/**
 * The static system message — grammar primer + worked examples. Stable
 * across turns so providers with KV-cache reuse (WebLLM, OpenAI, …) can
 * skip re-encoding it.
 */
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Per-turn user message: current source + optional reference + instruction.
 * Pair with `buildSystemPrompt()` when calling `provider.chat([...])`.
 */
export function buildUserMessage({
  currentSource,
  instruction,
  reference,
}: BuildPromptArgs): string {
  const parts: string[] = [];
  if (currentSource.trim().length > 0) {
    parts.push(`Current composition:\n\`\`\`synth\n${currentSource.trim()}\n\`\`\``);
  }
  if (reference && reference.trim().length > 0 && reference.trim() !== currentSource.trim()) {
    parts.push(
      `User-provided reference (treat as the new baseline):\n\`\`\`synth\n${reference.trim()}\n\`\`\``,
    );
  }
  parts.push(
    `Task: ${instruction.trim()}\n\nReturn ONLY the voices, instrument defs, or directives that need to change for this request — wrapped in a single \`\`\`synth fenced block. Do NOT repeat unchanged voices or instruments. The host will splice your changes into the current composition by name. If you must introduce a brand-new voice or instrument, just write it out; the host will append it. Each block stays self-contained: voice { … }, instrument define { … }, \\tempo N, \\time N/D, \\key …, \\use "…".`,
  );
  return parts.join("\n\n");
}

/**
 * Backward-compatible single-string prompt. Concatenates the system prompt
 * and user message; useful for providers that don't expose a chat-message
 * interface.
 */
export function buildPrompt(args: BuildPromptArgs): string {
  return `${buildSystemPrompt()}\n\n${buildUserMessage(args)}`;
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
