import { describe, expect, it } from "vitest";
import { getHover } from "./hover.js";

describe("getHover — pitches", () => {
  it("absolute pitch shows frequency", () => {
    const src = "4 c4";
    // c4 starts at offset 2
    const info = getHover(src, 2);
    expect(info).not.toBeNull();
    expect(info?.contents.join("\n")).toContain("c4");
    expect(info?.contents.join("\n")).toMatch(/\d+\.\d+ Hz/);
  });

  it("pitch with cents shows detune", () => {
    const src = "4 a4+15c";
    const info = getHover(src, 2);
    expect(info?.contents.join("\n")).toContain("Detune");
    expect(info?.contents.join("\n")).toContain("15");
  });

  it("pitch without cents has no detune line", () => {
    const src = "4 c4";
    const info = getHover(src, 2);
    expect(info?.contents.join("\n")).not.toContain("Detune");
  });

  it("hover returns a range with start/end", () => {
    const src = "4 c4";
    const info = getHover(src, 2);
    expect(info?.range.start).toBeDefined();
    expect(info?.range.end).toBeDefined();
  });
});

describe("getHover — note metadata", () => {
  const src = `\\version "2.0"
\\tempo 120
\\time 4/4
voice melody {
  \\instrument sawtooth
  \\f
  4 c4 d4
  8 r e4
}`;

  it("shows voice + position + duration + volume + instrument for a pitched note", () => {
    const offset = src.indexOf("c4");
    const info = getHover(src, offset);
    const blob = info?.contents.join("\n") ?? "";
    expect(blob).toContain("Voice:");
    expect(blob).toContain("melody");
    expect(blob).toContain("Position:");
    expect(blob).toContain("bar 1");
    expect(blob).toContain("Duration:");
    expect(blob).toContain("quarter");
    expect(blob).toContain("Volume:");
    expect(blob).toContain("\\f");
    expect(blob).toContain("Instrument:");
    expect(blob).toContain("sawtooth");
  });

  it("position advances for the second note", () => {
    const offset = src.indexOf("d4");
    const info = getHover(src, offset);
    const blob = info?.contents.join("\n") ?? "";
    // beat 2 at quarter = c4 was beat 1, d4 is beat 2
    expect(blob).toContain("beat 2");
  });

  it("rest hover reports duration + voice + position", () => {
    const offset = src.indexOf(" r") + 1;
    const info = getHover(src, offset);
    const blob = info?.contents.join("\n") ?? "";
    expect(blob).toContain("Rest");
    expect(blob).toContain("Duration:");
    expect(blob).toContain("eighth");
    expect(blob).toContain("Voice:");
    expect(blob).toContain("Position:");
  });

  it("repeat-expanded notes report a play count", () => {
    const repSrc = '\\version "2.0"\nvoice main { repeat 3 { 4 c4 } }';
    const offset = repSrc.indexOf("c4");
    const info = getHover(repSrc, offset);
    const blob = info?.contents.join("\n") ?? "";
    expect(blob).toContain("3×");
  });

  it("articulation is surfaced", () => {
    const artSrc = '\\version "2.0"\nvoice m { 4 c4. d4 }';
    const offset = artSrc.indexOf("c4");
    const info = getHover(artSrc, offset);
    const blob = info?.contents.join("\n") ?? "";
    expect(blob).toContain("Articulation:");
    expect(blob).toContain("staccato");
  });

  it("sticky-octave note shows resolved octave + frequency + metadata", () => {
    const stickySrc = '\\version "2.0"\nvoice m { 4 c4 d e }';
    const offsetD = stickySrc.indexOf(" d") + 1;
    const info = getHover(stickySrc, offsetD);
    const blob = info?.contents.join("\n") ?? "";
    expect(blob).toContain("d4");
    expect(blob).toContain("inherited");
    expect(blob).toMatch(/293\./);
    expect(blob).toContain("Voice:");
    expect(blob).toContain("Position:");
    expect(blob).toContain("beat 2");
  });

  it("sticky-octave note inside a chord resolves the right pitch", () => {
    const chordSrc = "voice m { 1 <c3 e g b> }";
    const offsetE = chordSrc.indexOf(" e ") + 1;
    const info = getHover(chordSrc, offsetE);
    const blob = info?.contents.join("\n") ?? "";
    expect(blob).toContain("e3");
    expect(blob).toMatch(/164\./);
  });

  it("slide target is surfaced", () => {
    const slideSrc = '\\version "2.0"\nvoice m { 2 e2 -> c3 }';
    const offset = slideSrc.indexOf("e2");
    const info = getHover(slideSrc, offset);
    const blob = info?.contents.join("\n") ?? "";
    expect(blob).toContain("Slide to:");
  });
});

describe("getHover — instrument", () => {
  const src = `\\version "2.0"
instrument define lead {
  oscillator sawtooth -7
  oscillator sawtooth
  oscillator sawtooth 7
  envelope adsr(0.04, 0.2, 0.75, 0.5)
  filter lowpass(3500, 0.6)
  gain 0.85
}
voice m { \\instrument lead\n4 c4 }`;

  it("\\instrument directive shows full breakdown", () => {
    const offset = src.indexOf("\\instrument lead") + "\\instrument ".length;
    const blob = getHover(src, offset)?.contents.join("\n") ?? "";
    expect(blob).toContain("\\\\instrument");
    expect(blob).toContain("lead");
    expect(blob).toContain("Oscillators");
    expect(blob).toContain("sawtooth");
    expect(blob).toContain("Filters:");
    expect(blob).toContain("lowpass");
    expect(blob).toContain("Envelope:");
    expect(blob).toContain("adsr");
    expect(blob).toContain("Gain:");
  });

  it("instrument define block shows full breakdown", () => {
    const offset = src.indexOf("instrument define lead") + "instrument define ".length;
    const blob = getHover(src, offset)?.contents.join("\n") ?? "";
    expect(blob).toContain("Instrument");
    expect(blob).toContain("Oscillators");
    expect(blob).toContain("Filters:");
  });

  it("note hover only shows the instrument name, not the breakdown", () => {
    const offset = src.indexOf("c4");
    const blob = getHover(src, offset)?.contents.join("\n") ?? "";
    expect(blob).toContain("**Instrument:** `lead`");
    // The full breakdown belongs on the directive hover, not the note.
    expect(blob).not.toContain("Oscillators");
    expect(blob).not.toContain("Filters:");
  });
});

describe("getHover — motif refs", () => {
  it("resolves to binding", () => {
    const src = "/// my intro\nintro = 4 c4\nintro";
    // The trailing 'intro' is at offset around src.indexOf("intro", 25)
    const offset = src.lastIndexOf("intro");
    const info = getHover(src, offset);
    expect(info).not.toBeNull();
    expect(info?.contents.join("\n")).toContain("intro");
    expect(info?.contents.join("\n")).toContain("my intro");
  });

  it("unresolved motif ref still produces hover", () => {
    const src = "unknown";
    const info = getHover(src, 0);
    expect(info).not.toBeNull();
    expect(info?.contents.join("\n")).toContain("unresolved");
  });
});

describe("getHover — calls", () => {
  it("call to known motif", () => {
    const src = "/// arp doc\narp(root) = 8 root\narp(c4)";
    const offset = src.lastIndexOf("arp");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("arp(root)");
  });

  it("effect call shows signature", () => {
    const src = "with reverb(2, 1, 0.7) { 4 c4 }";
    const offset = src.indexOf("reverb");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("reverb");
    expect(info?.contents.join("\n")).toContain("channels");
  });

  it("unresolved call produces hover", () => {
    const src = "/// fn\nfoo(x) = 4 x\nfoo(c4)";
    const offset = src.lastIndexOf("foo");
    const info = getHover(src, offset);
    expect(info).not.toBeNull();
  });
});

describe("getHover — annotations", () => {
  it("known annotation shows signature", () => {
    const src = '4 c4@cue("hit")';
    const offset = src.indexOf("@cue");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("@cue");
  });

  it("chance annotation shows signature", () => {
    const src = "4 c4@chance(0.5)";
    const offset = src.indexOf("@chance");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("@chance");
    expect(info?.contents.join("\n")).toContain("p");
  });
});

describe("getHover — bindings", () => {
  it("binding declaration shows signature + doc", () => {
    const src = "/// docs\nintro = 4 c4";
    const offset = src.indexOf("intro");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("intro");
  });

  it("binding with params shows full signature", () => {
    const src = "arp(root) = 4 root";
    const offset = src.indexOf("arp");
    const info = getHover(src, offset);
    expect(info?.contents.join("\n")).toContain("arp(root)");
  });
});

describe("getHover — instruments", () => {
  it("instrument def shows name", () => {
    const src = "instrument define warm { oscillator sawtooth }";
    const offset = src.indexOf("warm");
    const info = getHover(src, offset);
    expect(info).not.toBeNull();
    expect(info?.contents.join("\n")).toContain("warm");
  });
});

describe("getHover — non-hoverable position", () => {
  it("cursor on whitespace returns null or composition-level info", () => {
    const src = "4 c4";
    const info = getHover(src, 1); // space
    // Either null or composition-level — both acceptable
    if (info) {
      expect(info.contents).toBeDefined();
    }
  });

  it("malformed source returns null", () => {
    const src = "4 ,";
    expect(getHover(src, 0)).toBeNull();
  });
});
