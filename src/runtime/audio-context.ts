export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: AudioNodeLike;
  readonly sampleRate: number;
  readonly state: "suspended" | "running" | "closed";

  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createConvolver(): ConvolverNodeLike;
  createDelay(maxDelayTime?: number): DelayNodeLike;
  createWaveShaper(): WaveShaperNodeLike;
  createDynamicsCompressor(): DynamicsCompressorNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;

  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export interface AudioNodeLike {
  connect(target: AudioNodeLike): AudioNodeLike;
  disconnect(): void;
}

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): AudioParamLike;
  linearRampToValueAtTime(value: number, endTime: number): AudioParamLike;
  exponentialRampToValueAtTime(value: number, endTime: number): AudioParamLike;
  cancelScheduledValues(startTime: number): AudioParamLike;
}

export interface OscillatorNodeLike extends AudioNodeLike {
  type: "sine" | "square" | "sawtooth" | "triangle";
  frequency: AudioParamLike;
  detune: AudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
  onended: ((this: OscillatorNodeLike, ev: Event) => void) | null;
}

export interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type:
    | "lowpass"
    | "highpass"
    | "bandpass"
    | "notch"
    | "allpass"
    | "lowshelf"
    | "highshelf"
    | "peaking";
  frequency: AudioParamLike;
  Q: AudioParamLike;
}

export interface ConvolverNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
}

export interface DelayNodeLike extends AudioNodeLike {
  delayTime: AudioParamLike;
}

export interface WaveShaperNodeLike extends AudioNodeLike {
  curve: Float32Array | null;
  oversample: "none" | "2x" | "4x";
}

export interface DynamicsCompressorNodeLike extends AudioNodeLike {
  threshold: AudioParamLike;
  ratio: AudioParamLike;
  attack: AudioParamLike;
  release: AudioParamLike;
}

export interface AudioBufferLike {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export function adaptAudioContext(ctx: AudioContext): AudioContextLike {
  // Browser AudioContext is already structurally compatible.
  // Cast at the boundary; a runtime sanity check ensures the required methods exist.
  const required = [
    "createOscillator",
    "createGain",
    "createBiquadFilter",
    "createConvolver",
    "createDelay",
    "createWaveShaper",
    "createDynamicsCompressor",
    "createBuffer",
    "resume",
    "suspend",
    "close",
  ];
  for (const m of required) {
    if (typeof (ctx as unknown as Record<string, unknown>)[m] !== "function") {
      throw new TypeError(`AudioContext missing required method: ${m}`);
    }
  }
  return ctx as unknown as AudioContextLike;
}
