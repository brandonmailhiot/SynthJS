import type { AnnotationData, CompositionIR, TimelineEvent, VoiceTimeline } from "../ir/nodes.js";

const PPQ = 480;

export function exportMidi(ir: CompositionIR): Uint8Array {
  const microsPerQuarter = Math.round(60_000_000 / ir.tempo);
  const tracks: Uint8Array[] = [];
  tracks.push(buildConductorTrack(microsPerQuarter, ir.timeSig.numerator, ir.timeSig.denominator));
  for (const voice of ir.voices) {
    tracks.push(buildVoiceTrack(voice));
  }
  return assembleSmf(1, tracks);
}

function assembleSmf(format: number, tracks: Uint8Array[]): Uint8Array {
  const header = new Uint8Array(14);
  header.set([0x4d, 0x54, 0x68, 0x64], 0); // "MThd"
  writeUint32(header, 4, 6); // length = 6
  writeUint16(header, 8, format);
  writeUint16(header, 10, tracks.length);
  writeUint16(header, 12, PPQ);

  let totalLen = header.length;
  for (const t of tracks) totalLen += t.length;
  const out = new Uint8Array(totalLen);
  out.set(header, 0);
  let offset = header.length;
  for (const t of tracks) {
    out.set(t, offset);
    offset += t.length;
  }
  return out;
}

function buildConductorTrack(
  microsPerQuarter: number,
  timeSigNum: number,
  timeSigDenom: number,
): Uint8Array {
  const events: number[] = [];
  // delta = 0, tempo meta
  events.push(0); // delta
  events.push(0xff, 0x51, 0x03);
  events.push(
    (microsPerQuarter >> 16) & 0xff,
    (microsPerQuarter >> 8) & 0xff,
    microsPerQuarter & 0xff,
  );
  // time signature meta
  events.push(0); // delta
  events.push(0xff, 0x58, 0x04);
  const denomPow = Math.round(Math.log2(timeSigDenom));
  events.push(timeSigNum, denomPow, 24, 8);
  // end of track
  events.push(0); // delta
  events.push(0xff, 0x2f, 0x00);

  return wrapTrack(new Uint8Array(events));
}

function buildVoiceTrack(voice: VoiceTimeline): Uint8Array {
  const channel = getMidiChannel(voice.events) ?? 0;
  const program = getMidiProgram(voice.events);

  type AbsEvent = { tick: number; bytes: number[] };
  const absEvents: AbsEvent[] = [];

  if (program !== undefined) {
    absEvents.push({ tick: 0, bytes: [0xc0 | channel, program] });
  }

  for (const ev of voice.events) {
    const startTick = Math.round(ev.startBeat * 4 * PPQ);
    const durationTick = Math.round(ev.durationBeats * 4 * PPQ);
    if (ev.frequencies.length === 0) continue; // rest
    const eventChannel = annotationOverrideChannel(ev.annotations) ?? channel;
    const velocity = Math.max(1, Math.min(127, Math.round(ev.gain * 127)));

    for (const freq of ev.frequencies) {
      const pitch = Math.round(69 + 12 * Math.log2(freq / 440));
      const safePitch = Math.max(0, Math.min(127, pitch));
      absEvents.push({ tick: startTick, bytes: [0x90 | eventChannel, safePitch, velocity] });
      absEvents.push({
        tick: startTick + durationTick,
        bytes: [0x80 | eventChannel, safePitch, 0],
      });
    }
  }

  // Sort by tick
  absEvents.sort((a, b) => a.tick - b.tick);

  // Convert to delta-time + event bytes
  const out: number[] = [];
  let lastTick = 0;
  for (const ev of absEvents) {
    const delta = ev.tick - lastTick;
    out.push(...vlq(delta));
    out.push(...ev.bytes);
    lastTick = ev.tick;
  }
  // End of track
  out.push(0); // delta
  out.push(0xff, 0x2f, 0x00);

  return wrapTrack(new Uint8Array(out));
}

function wrapTrack(content: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + content.length);
  out.set([0x4d, 0x54, 0x72, 0x6b], 0); // "MTrk"
  writeUint32(out, 4, content.length);
  out.set(content, 8);
  return out;
}

export function vlq(n: number): number[] {
  if (n < 0) throw new RangeError("VLQ requires non-negative");
  if (n === 0) return [0];
  const bytes: number[] = [];
  let v = n;
  bytes.push(v & 0x7f);
  v >>= 7;
  while (v > 0) {
    bytes.push((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes.reverse();
}

function writeUint32(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function writeUint16(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 8) & 0xff;
  buf[offset + 1] = value & 0xff;
}

function getMidiChannel(events: TimelineEvent[]): number | undefined {
  for (const ev of events) {
    const a = ev.annotations.find((x) => x.name === "@midi_channel");
    if (a && typeof a.args[0] === "number") return Math.max(0, Math.min(15, a.args[0] - 1));
  }
  return undefined;
}

function getMidiProgram(events: TimelineEvent[]): number | undefined {
  for (const ev of events) {
    const a = ev.annotations.find((x) => x.name === "@midi_program");
    if (a && typeof a.args[0] === "number") return Math.max(0, Math.min(127, a.args[0]));
  }
  return undefined;
}

function annotationOverrideChannel(annotations: AnnotationData[]): number | undefined {
  const a = annotations.find((x) => x.name === "@midi_channel");
  if (a && typeof a.args[0] === "number") return Math.max(0, Math.min(15, a.args[0] - 1));
  return undefined;
}
