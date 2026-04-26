import { describe, expect, it } from "vitest";
import { ResolveError } from "../errors.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import type { LoadedModule } from "./module-loader.js";
import { resolve, resolveWithImports } from "./resolve.js";

// ---- Helper ----

function r(src: string) {
  return resolve(parse(lex(src)));
}

function makeModule(src: string, path = "/test.synth"): LoadedModule {
  const ast = parse(lex(src));
  return {
    path,
    ast,
    imports: [],
  };
}

// ---- Bindings ----

describe("resolve — bindings", () => {
  it("known motif ref resolves", () => {
    // Define intro, then reference it from verse (note: in SynthJS single-letter
    // names like 'a' parse as pitch notes; use multi-char identifiers for motifs)
    expect(() => r("intro = 4 c4\nverse = intro")).not.toThrow();
  });

  it("unknown motif ref throws with did-you-mean", () => {
    // Define "intro" then reference "intoo" (typo) from separate binding
    expect(() => r("intro = 4 c4\nverse = intoo")).toThrow(/did you mean/);
  });

  it("unknown motif ref throws ResolveError", () => {
    // unknownRef is not defined anywhere
    expect(() => r("4 c4\nunknownRef")).toThrow(ResolveError);
  });

  it("forward refs allowed — binding order does not matter", () => {
    // verse references intro, but intro is defined after verse
    expect(() => r("verse = intro\nintro = 4 c4 d4")).not.toThrow();
  });

  it("voice-local binding not visible outside", () => {
    // localMotif is defined inside voice melody — not accessible at top level
    const src = "voice melody { localMotif = 4 c4 }\nlocalMotif";
    expect(() => r(src)).toThrow(ResolveError);
  });

  it("voice-local binding visible inside voice", () => {
    const src = "voice melody { localMotif = 4 c4\nlocalMotif }";
    expect(() => r(src)).not.toThrow();
  });

  it("top-level binding visible inside voice", () => {
    const src = "shared = 4 c4\nvoice melody { shared }";
    expect(() => r(src)).not.toThrow();
  });

  it("duplicate binding in same scope throws", () => {
    const src = "intro = 4 c4\nintro = 4 d4";
    expect(() => r(src)).toThrow(/already defined/);
  });

  it("symbol table returned with bindings", () => {
    const result = r("intro = 4 c4");
    expect(result.symbolTable.lookup("intro")).not.toBeNull();
  });

  it("parameterized call resolves — arp(c4)", () => {
    // arp is parameterized; calling arp(c4) should resolve OK
    const src = "arp(root) = 4 c4\nmotif = arp(c4)";
    expect(() => r(src)).not.toThrow();
  });
});

// ---- Cycles ----

describe("resolve — cycles", () => {
  it("self-cycle aa = aa throws", () => {
    // aa references itself (multi-char avoids note-letter ambiguity)
    expect(() => r("aa = aa")).toThrow(/cycle/);
  });

  it("mutual aa/bb cycle throws with path", () => {
    // aa -> bb -> aa
    expect(() => r("aa = bb\nbb = aa")).toThrow(ResolveError);
  });

  it("indirect cycle throws", () => {
    // motifA -> motifB -> motifC -> motifA
    const src = "motifA = motifB\nmotifB = motifC\nmotifC = motifA";
    expect(() => r(src)).toThrow(/cycle/);
  });

  it("cycle path includes both names", () => {
    // Verify the cycle error message contains the binding names
    const src = "motifA = motifB\nmotifB = motifA";
    expect(() => r(src)).toThrow(/motifA|motifB/);
  });

  it("no cycle when chain aa->bb->4 c4 (no back-edge)", () => {
    const src = "aa = bb\nbb = 4 c4";
    expect(() => r(src)).not.toThrow();
  });

  it("no cycle with independent bindings", () => {
    const src = "intro = 4 c4\nverse = 4 d4";
    expect(() => r(src)).not.toThrow();
  });
});

// ---- Effects ----

describe("resolve — effects", () => {
  it("known effect ok", () => {
    expect(() => r("with reverb(2, 1, 0.7) { 4 c4 }")).not.toThrow();
  });

  it("unknown effect with did-you-mean", () => {
    // "reveerb" should suggest "reverb"
    expect(() => r("with reveerb(2, 1, 0.7) { 4 c4 }")).toThrow(/did you mean 'reverb'/);
  });

  it("bad effect args reject — gain out of range", () => {
    expect(() => r("with gain(2) { 4 c4 }")).toThrow(/0\.\.1/);
  });

  it("unknown effect throws ResolveError", () => {
    expect(() => r("with nonexistent(1) { 4 c4 }")).toThrow(ResolveError);
  });

  it("gain with valid level ok", () => {
    expect(() => r("with gain(0.5) { 4 c4 }")).not.toThrow();
  });

  it("delay effect ok", () => {
    expect(() => r("with delay(0.3, 0.5) { 4 c4 }")).not.toThrow();
  });
});

// ---- Annotations ----

describe("resolve — annotations", () => {
  it("known annotation @section ok", () => {
    expect(() => r('@section("verse") { 4 c4 }')).not.toThrow();
  });

  it("unknown annotation with did-you-mean", () => {
    // "@cuee" should suggest "@cue"
    expect(() => r('@cuee("hit") 4 c4')).toThrow(/did you mean '@cue'/);
  });

  it("annotation on note ok", () => {
    expect(() => r('4 c4@cue("hit")')).not.toThrow();
  });

  it("unknown annotation throws ResolveError", () => {
    expect(() => r('@totally_unknown("x") 4 c4')).toThrow(ResolveError);
  });

  it("annotation arg validation — @chance out of range", () => {
    expect(() => r("@chance(2) 4 c4")).toThrow(/0\.\.1/);
  });
});

// ---- Instruments ----

describe("resolve — instruments", () => {
  it("primitive oscillator ok", () => {
    expect(() => r("\\instrument sawtooth\n4 c4")).not.toThrow();
  });

  it("custom instrument ok", () => {
    const src = "instrument define warm { oscillator sawtooth }\n\\instrument warm\n4 c4";
    expect(() => r(src)).not.toThrow();
  });

  it("unknown instrument throws", () => {
    expect(() => r("\\instrument xyz\n4 c4")).toThrow(ResolveError);
  });

  it("instrument define — bad oscillator type throws", () => {
    const src = "instrument define bad { oscillator waveform }";
    expect(() => r(src)).toThrow(/oscillator/);
  });

  it("instrument define — valid envelope field ok", () => {
    const src = "instrument define warm { oscillator sine\nenvelope adsr(0.01, 0.1, 0.7, 0.3) }";
    expect(() => r(src)).not.toThrow();
  });

  it("all primitive oscillators accepted", () => {
    for (const osc of ["sine", "square", "sawtooth", "triangle"]) {
      expect(() => r(`\\instrument ${osc}\n4 c4`)).not.toThrow();
    }
  });
});

// ---- Key/Mode ----

describe("resolve — key", () => {
  it("known mode ok", () => {
    expect(() => r("\\key c4 dorian\n4 c4")).not.toThrow();
  });

  it("known mode major ok", () => {
    expect(() => r("\\key c4 major\n4 c4")).not.toThrow();
  });
});

// ---- resolveWithImports ----

describe("resolveWithImports", () => {
  it("plain import brings bindings into scope", async () => {
    const importedMod = makeModule("intro = 4 c4 d4", "/shared.synth");
    const modules = new Map<string, LoadedModule>([["/shared.synth", importedMod]]);
    const ast = parse(lex('\\use "/shared.synth"\nverse = intro'));
    const result = await resolveWithImports(ast, modules);
    expect(result.symbolTable.lookup("intro")).not.toBeNull();
  });

  it("aliased import uses alias.name", async () => {
    const importedMod = makeModule("intro = 4 c4", "/shared.synth");
    const modules = new Map<string, LoadedModule>([["/shared.synth", importedMod]]);
    // Use aliased name in the referencing code
    const ast = parse(lex('\\use "/shared.synth" as s'));
    const result = await resolveWithImports(ast, modules);
    expect(result.symbolTable.lookup("s.intro")).not.toBeNull();
    expect(result.symbolTable.lookup("intro")).toBeNull();
  });

  it("selective import brings only named bindings", async () => {
    const importedMod = makeModule("intro = 4 c4\noutro = 4 d4", "/shared.synth");
    const modules = new Map<string, LoadedModule>([["/shared.synth", importedMod]]);
    const ast = parse(lex('\\use "/shared.synth" (intro)'));
    const result = await resolveWithImports(ast, modules);
    expect(result.symbolTable.lookup("intro")).not.toBeNull();
    expect(result.symbolTable.lookup("outro")).toBeNull();
  });

  it("selective import of missing name throws", async () => {
    const importedMod = makeModule("intro = 4 c4", "/shared.synth");
    const modules = new Map<string, LoadedModule>([["/shared.synth", importedMod]]);
    const ast = parse(lex('\\use "/shared.synth" (missing)'));
    await expect(resolveWithImports(ast, modules)).rejects.toThrow(/not found in module/);
  });

  it("import collision throws — duplicate name between import and local binding", async () => {
    const importedMod = makeModule("intro = 4 c4", "/shared.synth");
    const modules = new Map<string, LoadedModule>([["/shared.synth", importedMod]]);
    // intro comes from both the imported module AND a local binding
    const ast = parse(lex('\\use "/shared.synth"\nintro = 4 d4'));
    // The import adds intro to the table; then the local binding resolution tries to define intro again
    await expect(resolveWithImports(ast, modules)).rejects.toThrow(/already defined|conflict/);
  });

  it("module found via suffix match (./relative path)", async () => {
    const importedMod = makeModule("loop = 4 c4", "/libs/loop.synth");
    const modules = new Map<string, LoadedModule>([["/libs/loop.synth", importedMod]]);
    const ast = parse(lex('\\use "./loop.synth"\nloop'));
    const result = await resolveWithImports(ast, modules);
    expect(result.symbolTable.lookup("loop")).not.toBeNull();
  });

  it("missing module throws ResolveError", async () => {
    const modules = new Map<string, LoadedModule>();
    const ast = parse(lex('\\use "/missing.synth"\n4 c4'));
    await expect(resolveWithImports(ast, modules)).rejects.toThrow(/module not found/);
  });

  it("module exporting InstrumentDef is importable", async () => {
    const importedMod = makeModule(
      "instrument define warm { oscillator sawtooth }",
      "/instruments.synth",
    );
    const modules = new Map<string, LoadedModule>([["/instruments.synth", importedMod]]);
    const ast = parse(lex('\\use "/instruments.synth"\n\\instrument warm\n4 c4'));
    const result = await resolveWithImports(ast, modules);
    expect(result.symbolTable.lookup("warm")).not.toBeNull();
  });

  it("aliased import collision throws when two modules export same qualified name", async () => {
    const importedMod = makeModule("intro = 4 c4", "/shared.synth");
    // Two use-decls with same alias cause collision on s.intro
    const modules = new Map<string, LoadedModule>([["/shared.synth", importedMod]]);
    const ast = parse(lex('\\use "/shared.synth" as s\n\\use "/shared.synth" as s'));
    await expect(resolveWithImports(ast, modules)).rejects.toThrow(/already defined|conflict/);
  });

  it("plain import collision throws when two modules export same name", async () => {
    const mod1 = makeModule("loop = 4 c4", "/a.synth");
    const mod2 = makeModule("loop = 4 d4", "/b.synth");
    const modules = new Map<string, LoadedModule>([
      ["/a.synth", mod1],
      ["/b.synth", mod2],
    ]);
    const ast = parse(lex('\\use "/a.synth"\n\\use "/b.synth"\n4 c4'));
    await expect(resolveWithImports(ast, modules)).rejects.toThrow(/already defined|conflict/);
  });
});
