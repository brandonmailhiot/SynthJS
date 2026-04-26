import type { Composition, UseDecl } from "../ast/nodes.js";
import { ResolveError } from "../errors.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";

export type FileResolver = (path: string) => Promise<string>;

export type LoadedModule = {
  path: string;
  ast: Composition;
  imports: { path: string; useDecl: UseDecl }[];
};

export type LoadResult = LoadedModule & {
  modules: Map<string, LoadedModule>;
};

export class ModuleLoader {
  private cache = new Map<string, LoadedModule>();

  constructor(private readonly resolveFile: FileResolver) {}

  async load(entryPath: string): Promise<LoadResult> {
    const visiting = new Set<string>();
    const modules = new Map<string, LoadedModule>();
    const root = await this.loadOne(entryPath, visiting, modules);
    return { ...root, modules };
  }

  private async loadOne(
    path: string,
    visiting: Set<string>,
    modules: Map<string, LoadedModule>,
  ): Promise<LoadedModule> {
    if (visiting.has(path)) {
      const cycle = [...visiting, path].join(" -> ");
      throw new ResolveError(`module cycle: ${cycle}`, { start: 0, end: 0, line: 1, column: 1 });
    }
    const cached = this.cache.get(path);
    if (cached) {
      modules.set(path, cached);
      return cached;
    }
    visiting.add(path);

    const src = await this.resolveFile(path);
    const ast = parse(lex(src));
    const useDecls = ast.body.filter((n): n is UseDecl => n.kind === "UseDecl");
    const imports = useDecls.map((u) => ({
      path: this.resolvePath(path, u.path),
      useDecl: u,
    }));

    const mod: LoadedModule = { path, ast, imports };
    this.cache.set(path, mod);
    modules.set(path, mod);

    for (const imp of imports) {
      await this.loadOne(imp.path, visiting, modules);
    }

    visiting.delete(path);
    return mod;
  }

  private resolvePath(importer: string, target: string): string {
    if (target.startsWith("@stdlib/")) return target;
    if (target.startsWith("./") || target.startsWith("../")) {
      const importerDir = importer.replace(/\/[^/]*$/, "");
      const segments = `${importerDir}/${target}`.split("/");
      const out: string[] = [];
      for (const s of segments) {
        if (s === "." || s === "") continue;
        if (s === "..") out.pop();
        else out.push(s);
      }
      return `/${out.join("/")}`;
    }
    return target;
  }
}
