import type { Binding, InstrumentDef, VoiceDecl } from "../ast/nodes.js";
import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";

export type GenDocsOptions = {
  title?: string;
};

export function generateDocs(source: string, opts: GenDocsOptions = {}): string {
  const ast = parse(lex(source));
  const lines: string[] = [];
  if (opts.title) {
    lines.push(`# ${opts.title}`);
    lines.push("");
  }
  for (const node of ast.body) {
    if (node.kind === "Binding") {
      const sig = node.params ? `${node.name}(${node.params.join(", ")})` : node.name;
      lines.push(`## \`${sig}\``);
      lines.push("");
      if (node.doc) {
        lines.push(node.doc.trim());
        lines.push("");
      }
    } else if (node.kind === "InstrumentDef") {
      lines.push(`## instrument \`${node.name}\``);
      lines.push("");
      if (node.doc) {
        lines.push(node.doc.trim());
        lines.push("");
      }
    } else if (node.kind === "VoiceDecl") {
      lines.push(`## voice \`${node.name}\``);
      lines.push("");
      if (node.doc) {
        lines.push(node.doc.trim());
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}
