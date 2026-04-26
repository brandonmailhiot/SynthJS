import { describe, expect, it } from "vitest";
import { audioBufferToWav, renderToWav } from "./render-wav.js";
import { MockAudioContext } from "../runtime/mock-audio-context.js";
import type { AudioBufferLike } from "../runtime/audio-context.js";

class MockOfflineAudioContext extends MockAudioContext {
  private renderResult: AudioBufferLike;
  constructor(channels: number, length: number, sampleRate: number) {
    super();
    this.sampleRate = sampleRate;
    this.renderResult = this.createBuffer(channels, length, sampleRate);
  }
  async startRendering(): Promise<AudioBufferLike> {
    return this.renderResult;
  }
  setBuffer(buf: AudioBufferLike): void {
    this.renderResult = buf;
  }
}

describe("audioBufferToWav — header", () => {
  it("RIFF/WAVE/fmt/data chunks", () => {
    const ctx = new MockOfflineAudioContext(2, 100, 44100);
    const buf = ctx.createBuffer(2, 100, 44100);
    const wav = audioBufferToWav(buf);
    expect(String.fromCharCode(wav[0]!, wav[1]!, wav[2]!, wav[3]!)).toBe("RIFF");
    expect(String.fromCharCode(wav[8]!, wav[9]!, wav[10]!, wav[11]!)).toBe("WAVE");
    expect(String.fromCharCode(wav[12]!, wav[13]!, wav[14]!, wav[15]!)).toBe("fmt ");
    expect(String.fromCharCode(wav[36]!, wav[37]!, wav[38]!, wav[39]!)).toBe("data");
  });

  it("PCM format code", () => {
    const ctx = new MockOfflineAudioContext(1, 100, 44100);
    const buf = ctx.createBuffer(1, 100, 44100);
    const wav = audioBufferToWav(buf);
    // Bytes 20-21: format code (LE), should be 1
    expect(wav[20]).toBe(1);
    expect(wav[21]).toBe(0);
  });

  it("sample rate encoded little-endian", () => {
    const ctx = new MockOfflineAudioContext(1, 100, 44100);
    const buf = ctx.createBuffer(1, 100, 44100);
    const wav = audioBufferToWav(buf);
    // Bytes 24-27: sample rate (LE), 44100 = 0x0000AC44
    expect(wav[24]).toBe(0x44);
    expect(wav[25]).toBe(0xac);
    expect(wav[26]).toBe(0x00);
    expect(wav[27]).toBe(0x00);
  });

  it("data size matches samples * channels * 2 bytes", () => {
    const ctx = new MockOfflineAudioContext(2, 1000, 44100);
    const buf = ctx.createBuffer(2, 1000, 44100);
    const wav = audioBufferToWav(buf);
    // Bytes 40-43: data size (LE), should be 2 * 1000 * 2 = 4000
    const dataSize = wav[40]! | (wav[41]! << 8) | (wav[42]! << 16) | (wav[43]! << 24);
    expect(dataSize).toBe(4000);
  });

  it("total file size = 8 + 36 + dataSize", () => {
    const ctx = new MockOfflineAudioContext(1, 100, 44100);
    const buf = ctx.createBuffer(1, 100, 44100);
    const wav = audioBufferToWav(buf);
    const dataSize = 100 * 1 * 2;
    expect(wav.length).toBe(8 + 36 + dataSize);
  });

  it("sample data interleaved across channels", () => {
    const ctx = new MockOfflineAudioContext(2, 4, 44100);
    const buf = ctx.createBuffer(2, 4, 44100);
    // Set channel 0 to 0.5, channel 1 to -0.5
    const ch0 = buf.getChannelData(0);
    const ch1 = buf.getChannelData(1);
    for (let i = 0; i < 4; i++) {
      ch0[i] = 0.5;
      ch1[i] = -0.5;
    }
    const wav = audioBufferToWav(buf);
    // Data starts at offset 44; first sample channel 0 = 0.5 * 0x7FFF = 16383 = 0x3FFF (LE: 0xFF 0x3F)
    expect(wav[44]).toBe(0xff);
    expect(wav[45]).toBe(0x3f);
    // Second sample channel 1 = -0.5 * 0x8000 = -16384 = 0xC000 (two's complement, LE: 0x00 0xC0)
    expect(wav[46]).toBe(0x00);
    expect(wav[47]).toBe(0xc0);
  });

  it("clips out-of-range samples", () => {
    const ctx = new MockOfflineAudioContext(1, 1, 44100);
    const buf = ctx.createBuffer(1, 1, 44100);
    buf.getChannelData(0)[0] = 2.0; // exceeds 1.0
    const wav = audioBufferToWav(buf);
    // Clipped to 1.0 = 0x7FFF (LE: 0xFF 0x7F)
    expect(wav[44]).toBe(0xff);
    expect(wav[45]).toBe(0x7f);
  });
});

describe("renderToWav", () => {
  it("renders a CompositionIR via OfflineAudioContext", async () => {
    const ctx = new MockOfflineAudioContext(2, 1000, 44100);
    const ir = {
      tempo: 60,
      timeSig: { numerator: 4, denominator: 4 },
      voices: [],
      diagnostics: [],
    };
    const wav = await renderToWav(ir, ctx);
    expect(wav.length).toBeGreaterThan(44); // at least header
    expect(String.fromCharCode(wav[0]!, wav[1]!, wav[2]!, wav[3]!)).toBe("RIFF");
  });
});
