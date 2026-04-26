import type { InstrumentSpec } from "../ir/nodes.js";
import type { AudioContextLike, AudioNodeLike, OscillatorNodeLike } from "./audio-context.js";

export type OscillatorRig = {
  source: OscillatorNodeLike;
  output: AudioNodeLike;
};

export function buildOscillator(
  ctx: AudioContextLike,
  instrument: InstrumentSpec,
  frequency: number,
): OscillatorRig {
  const osc = ctx.createOscillator();
  osc.type = instrument.oscillator;
  osc.frequency.value = frequency;
  if (instrument.detune !== undefined && instrument.detune !== 0) {
    osc.detune.setValueAtTime(instrument.detune, 0);
  }
  if (instrument.filter) {
    const filter = ctx.createBiquadFilter();
    const filterType = instrument.filter.type;
    if (
      filterType === "lowpass" ||
      filterType === "highpass" ||
      filterType === "bandpass" ||
      filterType === "notch"
    ) {
      filter.type = filterType;
    }
    filter.frequency.value = instrument.filter.cutoff;
    filter.Q.value = instrument.filter.q;
    osc.connect(filter);
    return { source: osc, output: filter };
  }
  return { source: osc, output: osc };
}
