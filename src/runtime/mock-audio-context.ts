import type {
  AudioBufferLike,
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
  | { method: "createOscillator" }
  | { method: "createGain" }
  | { method: "createBiquadFilter" }
  | { method: "createConvolver" }
  | { method: "createDelay"; maxDelayTime?: number }
  | { method: "createWaveShaper" }
  | { method: "createDynamicsCompressor" }
  | { method: "createBuffer"; channels: number; length: number; sampleRate: number }
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
    this.history.push({ method: "createOscillator" });
    return new MockOscillatorNode();
  }
  createGain(): GainNodeLike {
    this.history.push({ method: "createGain" });
    return new MockGainNode();
  }
  createBiquadFilter(): BiquadFilterNodeLike {
    this.history.push({ method: "createBiquadFilter" });
    return new MockBiquadFilterNode();
  }
  createConvolver(): ConvolverNodeLike {
    this.history.push({ method: "createConvolver" });
    return new MockConvolverNode();
  }
  createDelay(maxDelayTime?: number): DelayNodeLike {
    this.history.push(
      maxDelayTime !== undefined
        ? { method: "createDelay", maxDelayTime }
        : { method: "createDelay" },
    );
    return new MockDelayNode();
  }
  createWaveShaper(): WaveShaperNodeLike {
    this.history.push({ method: "createWaveShaper" });
    return new MockWaveShaperNode();
  }
  createDynamicsCompressor(): DynamicsCompressorNodeLike {
    this.history.push({ method: "createDynamicsCompressor" });
    return new MockDynamicsCompressorNode();
  }
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike {
    this.history.push({ method: "createBuffer", channels, length, sampleRate });
    return new MockAudioBuffer(channels, length, sampleRate);
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
