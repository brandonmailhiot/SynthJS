import { describe, expect, it } from "vitest";
import { compileSync } from "../index.js";
import { exportMidi, vlq } from "./export-midi.js";

describe("vlq encoding", () => {
  it("0 -> [0x00]", () => {
    expect(vlq(0)).toEqual([0x00]);
  });
  it("127 -> [0x7F]", () => {
    expect(vlq(127)).toEqual([0x7f]);
  });
  it("128 -> [0x81, 0x00]", () => {
    expect(vlq(128)).toEqual([0x81, 0x00]);
  });
  it("16383 -> [0xFF, 0x7F]", () => {
    expect(vlq(16383)).toEqual([0xff, 0x7f]);
  });
  it("16384 -> [0x81, 0x80, 0x00]", () => {
    expect(vlq(16384)).toEqual([0x81, 0x80, 0x00]);
  });
});

describe("exportMidi — header", () => {
  it("starts with MThd", () => {
    const ir = compileSync("4 c4");
    const bytes = exportMidi(ir);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
  });

  it("declares header length 6", () => {
    const ir = compileSync("4 c4");
    const bytes = exportMidi(ir);
    // Bytes 4-7: header length
    expect(bytes[4]).toBe(0);
    expect(bytes[5]).toBe(0);
    expect(bytes[6]).toBe(0);
    expect(bytes[7]).toBe(6);
  });

  it("format 1", () => {
    const ir = compileSync("4 c4");
    const bytes = exportMidi(ir);
    expect(bytes[8]).toBe(0);
    expect(bytes[9]).toBe(1);
  });

  it("ntracks = 1 voice + 1 conductor = 2", () => {
    const ir = compileSync("4 c4");
    const bytes = exportMidi(ir);
    expect(bytes[10]).toBe(0);
    expect(bytes[11]).toBe(2);
  });

  it("division 480", () => {
    const ir = compileSync("4 c4");
    const bytes = exportMidi(ir);
    expect(bytes[12]).toBe(1);
    expect(bytes[13]).toBe(0xe0); // 480 = 0x01E0
  });
});

describe("exportMidi — tracks", () => {
  it("conductor + 2 voices", () => {
    const ir = compileSync("voice a { 4 c4 } voice b { 4 g4 }");
    const bytes = exportMidi(ir);
    expect(bytes[10]).toBe(0);
    expect(bytes[11]).toBe(3); // 1 conductor + 2 voices
  });

  it("contains tempo meta event", () => {
    const ir = compileSync("\\tempo 120\n4 c4");
    const bytes = exportMidi(ir);
    // Find 0xFF 0x51 0x03 in conductor track (after MThd + MTrk header = 14 + 8 = 22 + delta = 23)
    let foundTempo = false;
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x51 && bytes[i + 2] === 0x03) {
        foundTempo = true;
        break;
      }
    }
    expect(foundTempo).toBe(true);
  });

  it("contains time signature meta", () => {
    const ir = compileSync("\\time 4/4\n4 c4");
    const bytes = exportMidi(ir);
    let foundTs = false;
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x58 && bytes[i + 2] === 0x04) {
        foundTs = true;
        break;
      }
    }
    expect(foundTs).toBe(true);
  });

  it("contains note-on (0x9N) and note-off (0x8N)", () => {
    const ir = compileSync("4 c4");
    const bytes = exportMidi(ir);
    let foundOn = false;
    let foundOff = false;
    for (const b of bytes) {
      if ((b & 0xf0) === 0x90) foundOn = true;
      if ((b & 0xf0) === 0x80) foundOff = true;
    }
    expect(foundOn).toBe(true);
    expect(foundOff).toBe(true);
  });
});

describe("exportMidi — frequency to MIDI pitch", () => {
  it("a4 (440Hz) -> MIDI 69", () => {
    const ir = compileSync("4 a4");
    const bytes = exportMidi(ir);
    // Find note-on, then read pitch byte
    for (let i = 0; i < bytes.length - 2; i++) {
      if (((bytes[i] ?? 0) & 0xf0) === 0x90) {
        expect(bytes[i + 1]).toBe(69);
        return;
      }
    }
    expect.fail("No note-on found");
  });

  it("c4 (~261.6Hz) -> MIDI 60", () => {
    const ir = compileSync("4 c4");
    const bytes = exportMidi(ir);
    for (let i = 0; i < bytes.length - 2; i++) {
      if (((bytes[i] ?? 0) & 0xf0) === 0x90) {
        expect(bytes[i + 1]).toBe(60);
        return;
      }
    }
    expect.fail("No note-on found");
  });
});

describe("exportMidi — annotations", () => {
  it("@midi_channel(2) routes to channel 1 (0-indexed)", () => {
    const ir = compileSync("@midi_channel(2) voice melody { 4 c4 }");
    const bytes = exportMidi(ir);
    let found = false;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x91) {
        found = true;
        break;
      } // 0x90 | 1
    }
    expect(found).toBe(true);
  });

  it("@midi_program emits program change", () => {
    const ir = compileSync("@midi_program(56) voice melody { 4 c4 }");
    const bytes = exportMidi(ir);
    let found = false;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (((bytes[i] ?? 0) & 0xf0) === 0xc0 && bytes[i + 1] === 56) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

describe("exportMidi — chord", () => {
  it("emits multiple note-ons at same tick", () => {
    const ir = compileSync("4 <c4 e4 g4>");
    const bytes = exportMidi(ir);
    let noteOnCount = 0;
    for (const b of bytes) {
      if ((b & 0xf0) === 0x90) noteOnCount++;
    }
    expect(noteOnCount).toBe(3);
  });
});
