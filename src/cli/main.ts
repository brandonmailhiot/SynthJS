import { readFileSync, writeFileSync } from "node:fs";
import {
  LexError,
  ParseError,
  ResolveError,
  ValidationError,
  compileSync,
  exportJson,
  exportMidi,
  format,
  formatError,
  generateDocs,
  renderToWav,
} from "../index.js";

function readInput(path?: string): string {
  if (!path || path === "-") {
    return readFileSync(0, "utf8"); // 0 = stdin fd
  }
  return readFileSync(path, "utf8");
}

function tryCompile(source: string, sourceLabel: string): ReturnType<typeof compileSync> | null {
  try {
    return compileSync(source);
  } catch (e) {
    if (
      e instanceof LexError ||
      e instanceof ParseError ||
      e instanceof ResolveError ||
      e instanceof ValidationError
    ) {
      process.stderr.write(`${formatError(e, source)}\n`);
      return null;
    }
    process.stderr.write(`unexpected error in ${sourceLabel}: ${(e as Error).message}\n`);
    return null;
  }
}

function runFmt(args: string[]): number {
  let inPlace = false;
  let path: string | undefined;
  for (const a of args) {
    if (a === "-i") inPlace = true;
    else if (!a.startsWith("-")) path = a;
  }
  const source = readInput(path);
  let formatted: string;
  try {
    formatted = format(source);
  } catch (e) {
    process.stderr.write(`format failed: ${(e as Error).message}\n`);
    return 1;
  }
  if (inPlace) {
    if (!path || path === "-") {
      process.stderr.write("--in-place requires a file path\n");
      return 2;
    }
    writeFileSync(path, formatted);
  } else {
    process.stdout.write(formatted);
  }
  return 0;
}

function runCheck(args: string[]): number {
  const path = args.find((a) => !a.startsWith("-"));
  const source = readInput(path);
  const ir = tryCompile(source, path ?? "stdin");
  if (!ir) return 1;
  for (const d of ir.diagnostics) {
    process.stderr.write(
      `${d.severity}: ${d.message} at line ${d.span.line}, col ${d.span.column}\n`,
    );
  }
  return 0;
}

function runJson(args: string[]): number {
  const includeSpans = args.includes("--include-spans");
  const compact = args.includes("--compact");
  const path = args.find((a) => !a.startsWith("-"));
  const source = readInput(path);
  const ir = tryCompile(source, path ?? "stdin");
  if (!ir) return 1;
  process.stdout.write(`${exportJson(ir, { pretty: !compact, includeSpans })}\n`);
  return 0;
}

function runMidi(args: string[]): number {
  let outPath: string | undefined;
  let inPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o") {
      outPath = args[i + 1];
      i++;
    } else if (!args[i]?.startsWith("-")) {
      inPath = args[i];
    }
  }
  if (!outPath) {
    process.stderr.write("midi: -o <output> required\n");
    return 2;
  }
  const source = readInput(inPath);
  const ir = tryCompile(source, inPath ?? "stdin");
  if (!ir) return 1;
  const bytes = exportMidi(ir);
  writeFileSync(outPath, bytes);
  return 0;
}

function runDoc(args: string[]): number {
  let title: string | undefined;
  let outPath: string | undefined;
  let inPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--title") {
      title = args[i + 1];
      i++;
    } else if (args[i] === "-o") {
      outPath = args[i + 1];
      i++;
    } else if (!args[i]?.startsWith("-")) inPath = args[i];
  }
  const source = readInput(inPath);
  const md = generateDocs(source, title !== undefined ? { title } : {});
  if (outPath) writeFileSync(outPath, md);
  else process.stdout.write(md);
  return 0;
}

async function runRender(args: string[]): Promise<number> {
  let outPath: string | undefined;
  let inPath: string | undefined;
  let sampleRate = 44100;
  let channels = 2;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-o") {
      outPath = args[i + 1];
      i++;
    } else if (a === "--sample-rate") {
      sampleRate = Number.parseInt(args[i + 1] ?? "44100", 10);
      i++;
    } else if (a === "--channels") {
      channels = Number.parseInt(args[i + 1] ?? "2", 10);
      i++;
    } else if (a && !a.startsWith("-")) {
      inPath = a;
    }
  }
  if (!outPath) {
    process.stderr.write("render: -o <output> required\n");
    return 2;
  }
  const source = readInput(inPath);
  const ir = tryCompile(source, inPath ?? "stdin");
  if (!ir) return 1;

  let OfflineAudioContextCtor: new (channels: number, length: number, sampleRate: number) => unknown;
  try {
    // Dynamic import via runtime string to avoid build-time type resolution.
    const modName = "node-web-audio-api";
    const mod = (await import(modName)) as unknown as {
      OfflineAudioContext: new (c: number, l: number, sr: number) => unknown;
    };
    OfflineAudioContextCtor = mod.OfflineAudioContext;
  } catch {
    process.stderr.write(
      "render requires 'node-web-audio-api' as an optional peer dependency.\n" +
        "Install it: pnpm add -D node-web-audio-api\n",
    );
    return 3;
  }

  let durationSec = 0;
  for (const voice of ir.voices) {
    for (const ev of voice.events) {
      const end = (ev.startBeat + ev.durationBeats) * 4 * (60 / ir.tempo);
      if (end > durationSec) durationSec = end;
    }
  }
  durationSec = Math.max(1, durationSec + 0.5);

  const ctx = new OfflineAudioContextCtor(
    channels,
    Math.ceil(durationSec * sampleRate),
    sampleRate,
  ) as Parameters<typeof renderToWav>[1];
  const wavBytes = await renderToWav(ir, ctx);
  writeFileSync(outPath, wavBytes);
  return 0;
}

function printHelp(): number {
  process.stdout.write(`synth — SynthJS CLI

USAGE:
  synth <command> [args]

COMMANDS:
  fmt [path] [-i]            Format source. Reads stdin if no path. -i writes back to file.
  check [path]               Parse + compile. Exits 1 on errors.
  json [path] [--include-spans] [--compact]
                             Emit CompositionIR as JSON.
  midi <input> -o <output>   Export to MIDI file.
  render <input> -o <output> [--sample-rate N] [--channels N]
                             Render to WAV file (requires node-web-audio-api).
  doc [path] [--title T] [-o <output>]
                             Generate Markdown docs from /// comments.
  help                       Show this help.
`);
  return 0;
}

const args = process.argv.slice(2);
const cmd = args[0];

async function main(): Promise<number> {
  switch (cmd) {
    case "fmt":
      return runFmt(args.slice(1));
    case "check":
      return runCheck(args.slice(1));
    case "json":
      return runJson(args.slice(1));
    case "midi":
      return runMidi(args.slice(1));
    case "render":
      return runRender(args.slice(1));
    case "doc":
      return runDoc(args.slice(1));
    case "help":
    case "--help":
    case undefined:
      return printHelp();
    default:
      process.stderr.write(`unknown command '${cmd}'. Run 'synth help'.\n`);
      return 2;
  }
}

main().then((code) => process.exit(code));
