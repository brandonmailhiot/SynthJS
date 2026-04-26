import { emitIR } from "../ir/emit.js";
import type { CompositionIR } from "../ir/nodes.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { getStdlibSource, isStdlibPath } from "../stdlib/index.js";
import type { Composition, TopLevel, UseDecl } from "../ast/nodes.js";
import { expandRepeats } from "./expand-repeats.js";
import { lowerEffects } from "./lower-effects.js";
import { lowerPitch } from "./lower-pitch.js";
import { lowerSticky } from "./lower-sticky.js";
import { type FileResolver, ModuleLoader } from "./module-loader.js";
import { resolve, resolveWithImports } from "./resolve.js";
import { validateMeter } from "./validate-meter.js";

export type CompileOptions = {
  fileResolver?: FileResolver;
  entryPath?: string;
};

function inlineStdlibImports(ast: Composition): Composition {
  const otherTopLevels: TopLevel[] = [];
  const stdlibUses: UseDecl[] = [];
  const userUses: UseDecl[] = [];

  for (const node of ast.body) {
    if (node.kind === "UseDecl") {
      if (isStdlibPath(node.path)) stdlibUses.push(node);
      else userUses.push(node);
    } else {
      otherTopLevels.push(node);
    }
  }

  if (userUses.length > 0) {
    throw new Error(
      `compileSync does not support relative \\use imports (only @stdlib/...). Use compile() instead.`,
    );
  }

  const inlinedBindings: TopLevel[] = [];
  for (const use of stdlibUses) {
    if (use.alias) {
      throw new Error(
        "compileSync stdlib imports don't support 'as' aliasing yet — use plain or selective form",
      );
    }
    const src = getStdlibSource(use.path);
    if (!src) continue;
    const stdlibAst = parse(lex(src));
    for (const node of stdlibAst.body) {
      if (node.kind === "Binding" || node.kind === "InstrumentDef") {
        if (use.selected && !use.selected.includes(node.name)) continue;
        inlinedBindings.push(node);
      }
    }
  }

  return {
    ...ast,
    body: [...inlinedBindings, ...otherTopLevels],
  };
}

export function compileSync(source: string): CompositionIR {
  let ast = parse(lex(source));
  ast = inlineStdlibImports(ast);
  const { symbolTable } = resolve(ast);
  let lowered = lowerSticky(ast).ast;
  lowered = lowerPitch(lowered, symbolTable).ast;
  lowered = expandRepeats(lowered);
  lowered = lowerEffects(lowered);
  const warnings = validateMeter(lowered);
  return emitIR(lowered, symbolTable, warnings);
}

export async function compile(source: string, opts: CompileOptions = {}): Promise<CompositionIR> {
  const { fileResolver } = opts;
  if (!fileResolver) {
    return compileSync(source);
  }
  const entryPath = opts.entryPath ?? "/__entry__";
  // Wrap fileResolver to return our source for the entry path.
  const wrappedResolver: FileResolver = async (p: string) => {
    if (p === entryPath) return source;
    return fileResolver(p);
  };
  const wrappedLoader = new ModuleLoader(wrappedResolver, { useStdlib: true });
  const loadResult = await wrappedLoader.load(entryPath);
  const { symbolTable } = await resolveWithImports(loadResult.ast, loadResult.modules);
  let lowered = lowerSticky(loadResult.ast).ast;
  lowered = lowerPitch(lowered, symbolTable).ast;
  lowered = expandRepeats(lowered);
  lowered = lowerEffects(lowered);
  const warnings = validateMeter(lowered);
  return emitIR(lowered, symbolTable, warnings);
}
