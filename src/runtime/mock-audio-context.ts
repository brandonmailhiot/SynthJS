import type {
  AudioBufferLike,
  AudioBufferSourceNodeLike,
  AudioContextLike,
  AudioNodeLike,
  AudioParamLike,
  BiquadFilterNodeLike,
  ConvolverNodeLike,
  DelayNodeLike,
  DynamicsCompressorNodeLike,
  GainNodeLike,
  OscillatorNodeLike,
  WaveShaperNodeLike,
} from "./audio-context.js";

export type MockEvent =
  | { method: "createOscillator"; result: OscillatorNodeLike }
  | { method: "createGain"; result: GainNodeLike }
  | { method: "createBiquadFilter"; result: BiquadFilterNodeLike }
  | { method: "createConvolver"; result: ConvolverNodeLike }
  | { method: "createDelay"; maxDelayTime?: number; result: DelayNodeLike }
  | { method: "createWaveShaper"; result: WaveShaperNodeLike }
  | { method: "createDynamicsCompressor"; result: DynamicsCompressorNodeLike }
  | {
      method: "createBuffer";
      channels: number;
      length: number;
      sampleRate: number;
      result: AudioBufferLike;
    }
  | { method: "createBufferSource"; result: AudioBufferSourceNodeLike }
  | { method: "resume" }
  | { method: "suspend" }
  | { method: "close" };

export type NodeEvent =
  | { method: "connect"; target: object }
  | { method: "disconnect" }
  | { method: "start"; when?: number }
  | { method: "stop"; when?: number }
  | {
      method: "param";
      name: string;
      op:
        | "setValueAtTime"
        | "linearRampToValueAtTime"
        | "exponentialRampToValueAtTime"
        | "cancelScheduledValues"
        | "set";
      value: number;
      time?: number;
    };

export class MockAudioContext implements AudioContextLike {
  history: MockEvent[] = [];
  currentTime = 0;
  destination: AudioNodeLike;
  sampleRate = 44100;
  state: "suspended" | "running" | "closed" = "suspended";

  constructor() {
    this.destination = new MockGainNode();
  }

  createOscillator(): OscillatorNodeLike {
    const result = new MockOscillatorNode();
    this.history.push({ method: "createOscillator", result });
    return result;
  }
  createGain(): GainNodeLike {
    const result = new MockGainNode();
    this.history.push({ method: "createGain", result });
    return result;
  }
  createBiquadFilter(): BiquadFilterNodeLike {
    const result = new MockBiquadFilterNode();
    this.history.push({ method: "createBiquadFilter", result });
    return result;
  }
  createConvolver(): ConvolverNodeLike {
    const result = new MockConvolverNode();
    this.history.push({ method: "createConvolver", result });
    return result;
  }
  createDelay(maxDelayTime?: number): DelayNodeLike {
    const result = new MockDelayNode();
    this.history.push(
      maxDelayTime !== undefined
        ? { method: "createDelay", maxDelayTime, result }
        : { method: "createDelay", result },
    );
    return result;
  }
  createWaveShaper(): WaveShaperNodeLike {
    const result = new MockWaveShaperNode();
    this.history.push({ method: "createWaveShaper", result });
    return result;
  }
  createDynamicsCompressor(): DynamicsCompressorNodeLike {
    const result = new MockDynamicsCompressorNode();
    this.history.push({ method: "createDynamicsCompressor", result });
    return result;
  }
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike {
    const result = new MockAudioBuffer(channels, length, sampleRate);
    this.history.push({ method: "createBuffer", channels, length, sampleRate, result });
    return result;
  }
  createBufferSource(): AudioBufferSourceNodeLike {
    const result = new MockAudioBufferSourceNode();
    this.history.push({ method: "createBufferSource", result });
    return result;
  }
  async resume(): Promise<void> {
    this.history.push({ method: "resume" });
    this.state = "running";
  }
  async suspend(): Promise<void> {
    this.history.push({ method: "suspend" });
    this.state = "suspended";
  }
  async close(): Promise<void> {
    this.history.push({ method: "close" });
    this.state = "closed";
  }
  async decodeAudioData(_buffer: ArrayBuffer): Promise<AudioBufferLike> {
    // Mocks return a 1-second silent stub buffer.
    return new MockAudioBuffer(1, this.sampleRate, this.sampleRate);
  }
}

class MockAudioParam implements AudioParamLike {
  history: NodeEvent[] = [];
  value = 0;
  constructor(public name: string) {}
  setValueAtTime(value: number, startTime: number): AudioParamLike {
    this.history.push({
      method: "param",
      name: this.name,
      op: "setValueAtTime",
      value,
      time: startTime,
    });
    return this;
  }
  linearRampToValueAtTime(value: number, endTime: number): AudioParamLike {
    this.history.push({
      method: "param",
      name: this.name,
      op: "linearRampToValueAtTime",
      value,
      time: endTime,
    });
    return this;
  }
  exponentialRampToValueAtTime(value: number, endTime: number): AudioParamLike {
    this.history.push({
      method: "param",
      name: this.name,
      op: "exponentialRampToValueAtTime",
      value,
      time: endTime,
    });
    return this;
  }
  cancelScheduledValues(startTime: number): AudioParamLike {
    this.history.push({
      method: "param",
      name: this.name,
      op: "cancelScheduledValues",
      value: 0,
      time: startTime,
    });
    return this;
  }
}

class MockBaseNode {
  history: NodeEvent[] = [];
  connect(target: AudioNodeLike): AudioNodeLike {
    this.history.push({ method: "connect", target });
    return target;
  }
  disconnect(): void {
    this.history.push({ method: "disconnect" });
  }
}

class MockOscillatorNode extends MockBaseNode implements OscillatorNodeLike {
  type: "sine" | "square" | "sawtooth" | "triangle" = "sine";
  frequency = new MockAudioParam("frequency");
  detune = new MockAudioParam("detune");
  onended: ((this: OscillatorNodeLike, ev: Event) => void) | null = null;
  start(when?: number): void {
    this.history.push(when !== undefined ? { method: "start", when } : { method: "start" });
  }
  stop(when?: number): void {
    this.history.push(when !== undefined ? { method: "stop", when } : { method: "stop" });
  }
}

class MockAudioBufferSourceNode extends MockBaseNode implements AudioBufferSourceNodeLike {
  buffer: AudioBufferLike | null = null;
  loop = false;
  playbackRate = new MockAudioParam("playbackRate");
  detune = new MockAudioParam("detune");
  start(when?: number): void {
    this.history.push(when !== undefined ? { method: "start", when } : { method: "start" });
  }
  stop(when?: number): void {
    this.history.push(when !== undefined ? { method: "stop", when } : { method: "stop" });
  }
}

class MockGainNode extends MockBaseNode implements GainNodeLike {
  gain = new MockAudioParam("gain");
}

class MockBiquadFilterNode extends MockBaseNode implements BiquadFilterNodeLike {
  type: BiquadFilterNodeLike["type"] = "lowpass";
  frequency = new MockAudioParam("frequency");
  Q = new MockAudioParam("Q");
}

class MockConvolverNode extends MockBaseNode implements ConvolverNodeLike {
  buffer: AudioBufferLike | null = null;
}

class MockDelayNode extends MockBaseNode implements DelayNodeLike {
  delayTime = new MockAudioParam("delayTime");
}

class MockWaveShaperNode extends MockBaseNode implements WaveShaperNodeLike {
  curve: Float32Array | null = null;
  oversample: "none" | "2x" | "4x" = "none";
}

class MockDynamicsCompressorNode extends MockBaseNode implements DynamicsCompressorNodeLike {
  threshold = new MockAudioParam("threshold");
  ratio = new MockAudioParam("ratio");
  attack = new MockAudioParam("attack");
  release = new MockAudioParam("release");
}

class MockAudioBuffer implements AudioBufferLike {
  private data: Float32Array[];
  constructor(
    public readonly numberOfChannels: number,
    public readonly length: number,
    public readonly sampleRate: number,
  ) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array {
    const buf = this.data[channel];
    if (!buf) throw new RangeError(`channel ${channel} out of range`);
    return buf;
  }
}
