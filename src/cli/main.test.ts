import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const cliPath = join(__dirname, "../../dist/cli.js");

const runCli = (
  args: string[],
  stdin?: string,
): { stdout: string; stderr: string; status: number } => {
  if (!existsSync(cliPath)) {
    throw new Error(`CLI not built. Run 'pnpm build' first. Path: ${cliPath}`);
  }
  try {
    const stdout = execFileSync("node", [cliPath, ...args], {
      encoding: "utf8",
      ...(stdin !== undefined ? { input: stdin } : {}),
    });
    return { stdout, stderr: "", status: 0 };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return {
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      status: err.status ?? 1,
    };
  }
};

const cliAvailable = existsSync(cliPath);

describe.skipIf(!cliAvailable)("CLI — help", () => {
  it("no args prints help", () => {
    const { stdout, status } = runCli([]);
    expect(status).toBe(0);
    expect(stdout).toContain("synth");
    expect(stdout).toContain("COMMANDS:");
  });

  it("help subcommand prints help", () => {
    const { stdout, status } = runCli(["help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("COMMANDS:");
  });

  it("--help flag prints help", () => {
    const { stdout, status } = runCli(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("COMMANDS:");
  });
});

describe.skipIf(!cliAvailable)("CLI — fmt", () => {
  it("formats stdin to stdout", () => {
    const { stdout, status } = runCli(["fmt"], "4 c4");
    expect(status).toBe(0);
    expect(stdout).toContain("4 c4");
  });

  it("formats file to stdout", () => {
    const dir = mkdtempSync(join(tmpdir(), "synth-test-"));
    const path = join(dir, "in.synth");
    writeFileSync(path, "4 c4 d4");
    const { stdout, status } = runCli(["fmt", path]);
    expect(status).toBe(0);
    expect(stdout).toContain("4 c4 d4");
  });

  it("-i writes back to file", () => {
    const dir = mkdtempSync(join(tmpdir(), "synth-test-"));
    const path = join(dir, "in.synth");
    writeFileSync(path, "4 c4 d4");
    runCli(["fmt", "-i", path]);
    const result = readFileSync(path, "utf8");
    expect(result).toContain("4 c4 d4");
  });
});

describe.skipIf(!cliAvailable)("CLI — check", () => {
  it("exits 0 on valid source", () => {
    const { status } = runCli(["check"], "4 c4");
    expect(status).toBe(0);
  });

  it("exits 1 on invalid source", () => {
    const { status, stderr } = runCli(["check"], "4 ,");
    expect(status).toBe(1);
    expect(stderr).toContain("ParseError");
  });
});

describe.skipIf(!cliAvailable)("CLI — json", () => {
  it("emits valid JSON", () => {
    const { stdout, status } = runCli(["json"], "4 c4");
    expect(status).toBe(0);
    expect(() => JSON.parse(stdout)).not.toThrow();
  });

  it("--compact removes whitespace", () => {
    const { stdout } = runCli(["json", "--compact"], "4 c4");
    expect(stdout.split("\n").length).toBeLessThan(5);
  });
});

describe.skipIf(!cliAvailable)("CLI — midi", () => {
  it("writes MIDI bytes to file", () => {
    const dir = mkdtempSync(join(tmpdir(), "synth-test-"));
    const inPath = join(dir, "in.synth");
    const outPath = join(dir, "out.mid");
    writeFileSync(inPath, "4 c4");
    const { status } = runCli(["midi", inPath, "-o", outPath]);
    expect(status).toBe(0);
    const bytes = readFileSync(outPath);
    expect(bytes.length).toBeGreaterThan(0);
    expect(bytes.subarray(0, 4).toString()).toBe("MThd");
  });

  it("requires -o", () => {
    const { status } = runCli(["midi"], "4 c4");
    expect(status).toBe(2);
  });
});

describe.skipIf(!cliAvailable)("CLI — doc", () => {
  it("emits markdown to stdout", () => {
    const src = "/// my motif\nintro = 4 c4";
    const { stdout, status } = runCli(["doc"], src);
    expect(status).toBe(0);
    expect(stdout).toContain("intro");
  });
});

describe.skipIf(!cliAvailable)("CLI — unknown command", () => {
  it("exits 2", () => {
    const { status, stderr } = runCli(["nonexistent"]);
    expect(status).toBe(2);
    expect(stderr).toContain("unknown command");
  });
});
