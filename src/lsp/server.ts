import {
  getCompletions,
  getDefinition,
  getDiagnostics,
  getHover,
  offsetToPosition,
  positionToOffset,
  rename,
} from "../index.js";
import { frameMessage, parseMessage } from "./protocol.js";

type RpcMessage = {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

type LspPosition = { line: number; character: number }; // 0-indexed
type LspRange = { start: LspPosition; end: LspPosition };

class LspServer {
  private documents = new Map<string, string>();
  private buffer = "";
  private shutdownReceived = false;

  start(): void {
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      this.buffer += chunk.toString();
      while (true) {
        const parsed = parseMessage(this.buffer);
        if (!parsed) break;
        this.buffer = parsed.rest;
        this.handle(parsed.message as RpcMessage);
      }
    });
    process.stdin.on("end", () => process.exit(0));
  }

  private send(msg: object): void {
    process.stdout.write(frameMessage(msg));
  }

  private respond(id: number | string | undefined, result: unknown): void {
    if (id === undefined) return;
    this.send({ jsonrpc: "2.0", id, result });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private handle(msg: RpcMessage): void {
    if (!msg.method) return;
    switch (msg.method) {
      case "initialize":
        this.respond(msg.id, this.initializeResult());
        return;
      case "initialized":
        return;
      case "shutdown":
        this.shutdownReceived = true;
        this.respond(msg.id, null);
        return;
      case "exit":
        process.exit(this.shutdownReceived ? 0 : 1);
        break;
      case "textDocument/didOpen":
        this.handleDidOpen(msg.params as { textDocument: { uri: string; text: string } });
        return;
      case "textDocument/didChange":
        this.handleDidChange(
          msg.params as { textDocument: { uri: string }; contentChanges: { text: string }[] },
        );
        return;
      case "textDocument/didClose":
        this.documents.delete((msg.params as { textDocument: { uri: string } }).textDocument.uri);
        return;
      case "textDocument/hover":
        this.respond(msg.id, this.handleHover(msg.params));
        return;
      case "textDocument/completion":
        this.respond(msg.id, this.handleCompletion(msg.params));
        return;
      case "textDocument/definition":
        this.respond(msg.id, this.handleDefinition(msg.params));
        return;
      case "textDocument/rename":
        this.respond(msg.id, this.handleRename(msg.params));
        return;
      case "textDocument/prepareRename":
        this.respond(msg.id, this.handlePrepareRename(msg.params));
        return;
      default:
        if (msg.id !== undefined) {
          this.send({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: -32601, message: `method not found: ${msg.method}` },
          });
        }
    }
  }

  private initializeResult(): object {
    return {
      capabilities: {
        textDocumentSync: 1, // full sync
        hoverProvider: true,
        completionProvider: { triggerCharacters: ["\\", "@", " "] },
        definitionProvider: true,
        renameProvider: { prepareProvider: true },
      },
    };
  }

  private handleDidOpen(params: { textDocument: { uri: string; text: string } }): void {
    this.documents.set(params.textDocument.uri, params.textDocument.text);
    this.publishDiagnostics(params.textDocument.uri);
  }

  private handleDidChange(params: {
    textDocument: { uri: string };
    contentChanges: { text: string }[];
  }): void {
    const last = params.contentChanges[params.contentChanges.length - 1];
    if (last) this.documents.set(params.textDocument.uri, last.text);
    this.publishDiagnostics(params.textDocument.uri);
  }

  private publishDiagnostics(uri: string): void {
    const source = this.documents.get(uri) ?? "";
    const diags = getDiagnostics(source);
    this.notify("textDocument/publishDiagnostics", {
      uri,
      diagnostics: diags.map((d) => ({
        range: oneToZeroRange(d.range),
        severity: severityToLsp(d.severity),
        message: d.message + (d.suggestion ? ` (did you mean '${d.suggestion}'?)` : ""),
        source: "synthjs",
      })),
    });
  }

  private getSourceAndOffset(params: unknown): { source: string; offset: number } | null {
    const p = params as { textDocument: { uri: string }; position: LspPosition };
    const source = this.documents.get(p.textDocument.uri);
    if (source === undefined) return null;
    const onePos = { line: p.position.line + 1, column: p.position.character + 1 };
    return { source, offset: positionToOffset(source, onePos) };
  }

  private handleHover(params: unknown): unknown {
    const ctx = this.getSourceAndOffset(params);
    if (!ctx) return null;
    const info = getHover(ctx.source, ctx.offset);
    if (!info) return null;
    return {
      contents: { kind: "markdown", value: info.contents.join("\n\n") },
      range: oneToZeroRange(info.range),
    };
  }

  private handleCompletion(params: unknown): unknown {
    const ctx = this.getSourceAndOffset(params);
    if (!ctx) return { items: [] };
    const items = getCompletions(ctx.source, ctx.offset).map((c) => ({
      label: c.label,
      kind: completionKindToLsp(c.kind),
      detail: c.detail,
      documentation: c.documentation,
    }));
    return { items, isIncomplete: false };
  }

  private handleDefinition(params: unknown): unknown {
    const ctx = this.getSourceAndOffset(params);
    if (!ctx) return null;
    const range = getDefinition(ctx.source, ctx.offset);
    if (!range) return null;
    const p = params as { textDocument: { uri: string } };
    return {
      uri: p.textDocument.uri,
      range: oneToZeroRange(range),
    };
  }

  private handleRename(params: unknown): unknown {
    const ctx = this.getSourceAndOffset(params);
    if (!ctx) return null;
    const newName = (params as { newName: string }).newName;
    const edits = rename(ctx.source, ctx.offset, newName);
    if (!edits) return null;
    const p = params as { textDocument: { uri: string } };
    return {
      changes: {
        [p.textDocument.uri]: edits.map((e) => ({
          range: oneToZeroRange(e.range),
          newText: e.newText,
        })),
      },
    };
  }

  private handlePrepareRename(params: unknown): unknown {
    const ctx = this.getSourceAndOffset(params);
    if (!ctx) return null;
    // Try renaming with a dummy name; if it returns edits, the cursor is on a renamable token
    const edits = rename(ctx.source, ctx.offset, "__placeholder__");
    if (!edits || edits.length === 0) return null;
    // Return the first edit's range as the "rename region"
    const first = edits[0];
    if (!first) return null;
    return oneToZeroRange(first.range);
  }
}

function oneToZeroRange(r: {
  start: { line: number; column: number };
  end: { line: number; column: number };
}): LspRange {
  return {
    start: { line: r.start.line - 1, character: r.start.column - 1 },
    end: { line: r.end.line - 1, character: r.end.column - 1 },
  };
}

function severityToLsp(s: "error" | "warning" | "info"): number {
  if (s === "error") return 1;
  if (s === "warning") return 2;
  if (s === "info") return 3;
  return 4; // hint
}

function completionKindToLsp(kind: string): number {
  // Minimal mapping; LSP completion kinds 1-25
  if (kind === "keyword") return 14;
  if (kind === "function") return 3;
  if (kind === "variable") return 6;
  if (kind === "value") return 12;
  if (kind === "directive") return 14;
  if (kind === "annotation") return 15;
  if (kind === "pitch") return 12;
  if (kind === "duration") return 12;
  if (kind === "instrument") return 7;
  if (kind === "effect") return 3;
  if (kind === "mode") return 12;
  return 1;
}

new LspServer().start();
