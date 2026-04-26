import { describe, expect, it, vi } from "vitest";
import { ResolveError } from "../errors.js";
import { ModuleLoader } from "./module-loader.js";

describe("ModuleLoader", () => {
  it("resolves relative paths against importer", async () => {
    const fileResolver = vi.fn(async (path: string) => {
      if (path === "/project/song.synth") return '\\use "./shared.synth"\n4 c4';
      if (path === "/project/shared.synth") return "intro = 4 c4";
      throw new Error(`unknown ${path}`);
    });
    const loader = new ModuleLoader(fileResolver);
    const result = await loader.load("/project/song.synth");
    expect(result.imports).toHaveLength(1);
    expect(result.imports[0]?.path).toBe("/project/shared.synth");
  });

  it("detects cycles", async () => {
    const files: Record<string, string> = {
      "/a.synth": '\\use "./b.synth"',
      "/b.synth": '\\use "./a.synth"',
    };
    const loader = new ModuleLoader(async (p) => files[p] ?? "");
    await expect(loader.load("/a.synth")).rejects.toThrow(ResolveError);
  });

  it("loads transitively imported modules", async () => {
    const files: Record<string, string> = {
      "/main.synth": '\\use "./a.synth"',
      "/a.synth": '\\use "./b.synth"',
      "/b.synth": "intro = 4 c4",
    };
    const loader = new ModuleLoader(async (p) => files[p] ?? "");
    const result = await loader.load("/main.synth");
    expect(result.modules.size).toBe(3);
  });

  it("@stdlib/scales resolves to stdlib path", async () => {
    const fr = vi.fn(async (p: string) => {
      if (p === "@stdlib/scales") return "major_scale(root) = 8 root";
      return '\\use "@stdlib/scales"';
    });
    const loader = new ModuleLoader(fr);
    const result = await loader.load("/main.synth");
    expect(result.imports[0]?.path).toBe("@stdlib/scales");
  });

  it("relative path with ../", async () => {
    const files: Record<string, string> = {
      "/project/sub/song.synth": '\\use "../shared/x.synth"',
      "/project/shared/x.synth": "intro = 4 c4",
    };
    const loader = new ModuleLoader(async (p) => files[p] ?? "");
    const result = await loader.load("/project/sub/song.synth");
    expect(result.imports[0]?.path).toBe("/project/shared/x.synth");
  });
});
