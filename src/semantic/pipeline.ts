import { emitIR } from "../ir/emit.js";
import type { CompositionIR } from "../ir/nodes.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
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

export function compileSync(source: string): CompositionIR {
  const ast = parse(lex(source));
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
  const wrappedLoader = new ModuleLoader(wrappedResolver);
  const loadResult = await wrappedLoader.load(entryPath);
  const { symbolTable } = await resolveWithImports(loadResult.ast, loadResult.modules);
  let lowered = lowerSticky(loadResult.ast).ast;
  lowered = lowerPitch(lowered, symbolTable).ast;
  lowered = expandRepeats(lowered);
  lowered = lowerEffects(lowered);
  const warnings = validateMeter(lowered);
  return emitIR(lowered, symbolTable, warnings);
}
