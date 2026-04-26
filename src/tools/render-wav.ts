import type { CompositionIR } from "../ir/nodes.js";
import { Composition } from "../runtime/composition.js";
import type { AudioContextLike, AudioBufferLike } from "../runtime/audio-context.js";

export interface OfflineAudioContextLike extends AudioContextLike {
  startRendering(): Promise<AudioBufferLike>;
}

export type RenderOptions = {
  durationSec?: number; // default = composition duration
};

export async function renderToWav(
  ir: CompositionIR,
  ctx: OfflineAudioContextLike,
  opts: RenderOptions = {},
): Promise<Uint8Array> {
  void opts; // durationSec reserved for future use
  const composition = new Composition(ir, { audioContext: ctx });
  await composition.play();
  const buffer = await ctx.startRendering();
  return audioBufferToWav(buffer);
}

export function audioBufferToWav(buffer: AudioBufferLike): Uint8Array {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const fileSize = 36 + dataSize;

  const buf = new Uint8Array(8 + fileSize);
  let o = 0;

  // "RIFF"
  buf[o++] = 0x52;
  buf[o++] = 0x49;
  buf[o++] = 0x46;
  buf[o++] = 0x46;
  // file size - 8
  writeUint32Le(buf, o, fileSize);
  o += 4;
  // "WAVE"
  buf[o++] = 0x57;
  buf[o++] = 0x41;
  buf[o++] = 0x56;
  buf[o++] = 0x45;
  // "fmt "
  buf[o++] = 0x66;
  buf[o++] = 0x6d;
  buf[o++] = 0x74;
  buf[o++] = 0x20;
  // fmt chunk size = 16
  writeUint32Le(buf, o, 16);
  o += 4;
  // PCM = 1
  writeUint16Le(buf, o, 1);
  o += 2;
  writeUint16Le(buf, o, channels);
  o += 2;
  writeUint32Le(buf, o, sampleRate);
  o += 4;
  writeUint32Le(buf, o, byteRate);
  o += 4;
  writeUint16Le(buf, o, blockAlign);
  o += 2;
  writeUint16Le(buf, o, 16); // bits per sample
  o += 2;
  // "data"
  buf[o++] = 0x64;
  buf[o++] = 0x61;
  buf[o++] = 0x74;
  buf[o++] = 0x61;
  writeUint32Le(buf, o, dataSize);
  o += 4;

  // Interleaved samples
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) channelData.push(buffer.getChannelData(c));

  for (let i = 0; i < length; i++) {
    for (let c = 0; c < channels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c]?.[i] ?? 0));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      writeInt16Le(buf, o, int16 | 0);
      o += 2;
    }
  }

  return buf;
}

function writeUint16Le(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
}

function writeUint32Le(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >> 24) & 0xff;
}

function writeInt16Le(buf: Uint8Array, offset: number, value: number): void {
  // Two's complement
  const v = value < 0 ? value + 0x10000 : value;
  writeUint16Le(buf, offset, v & 0xffff);
}
