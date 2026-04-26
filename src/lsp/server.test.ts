import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { frameMessage, parseMessage } from "./protocol.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const lspPath = join(__dirname, "../../dist/lsp.js");

const lspAvailable = existsSync(lspPath);

async function startLsp(): Promise<ChildProcess> {
  const child = spawn("node", [lspPath], { stdio: ["pipe", "pipe", "pipe"] });
  return child;
}

async function rpcCall(child: ChildProcess, message: object): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const handler = (data: Buffer) => {
      buf += data.toString();
      const parsed = parseMessage(buf);
      if (parsed) {
        child.stdout?.off("data", handler);
        resolve(parsed.message);
      }
    };
    child.stdout?.on("data", handler);
    child.stderr?.once("data", (d) => reject(new Error(`stderr: ${d.toString()}`)));
    child.stdin?.write(frameMessage(message));
  });
}

describe.skipIf(!lspAvailable)("LSP server", () => {
  it("responds to initialize", async () => {
    const child = await startLsp();
    const result = await rpcCall(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { processId: process.pid, rootUri: null, capabilities: {} },
    });
    expect(result).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { capabilities: expect.objectContaining({ hoverProvider: true }) },
    });
    child.kill();
  });

  it("publishes diagnostics on didOpen", async () => {
    const child = await startLsp();
    await rpcCall(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { processId: process.pid, rootUri: null, capabilities: {} },
    });
    // Send didOpen and wait for publishDiagnostics notification
    return new Promise<void>((resolve, reject) => {
      let buf = "";
      const handler = (data: Buffer) => {
        buf += data.toString();
        while (true) {
          const parsed = parseMessage(buf);
          if (!parsed) break;
          buf = parsed.rest;
          const msg = parsed.message as {
            method?: string;
            params?: { diagnostics: unknown[] };
          };
          if (msg.method === "textDocument/publishDiagnostics") {
            child.stdout?.off("data", handler);
            expect(msg.params?.diagnostics).toBeDefined();
            child.kill();
            resolve();
            return;
          }
        }
      };
      child.stdout?.on("data", handler);
      child.stdin?.write(
        frameMessage({
          jsonrpc: "2.0",
          method: "textDocument/didOpen",
          params: {
            textDocument: {
              uri: "file:///test.synth",
              languageId: "synthjs",
              version: 1,
              text: "4 c4 ! 4 d4",
            },
          },
        }),
      );
      setTimeout(() => reject(new Error("timeout")), 5000);
    });
  });

  it("responds to shutdown with null result", async () => {
    const child = await startLsp();
    await rpcCall(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { processId: process.pid, rootUri: null, capabilities: {} },
    });
    const result = await rpcCall(child, {
      jsonrpc: "2.0",
      id: 2,
      method: "shutdown",
      params: null,
    });
    expect(result).toMatchObject({ jsonrpc: "2.0", id: 2, result: null });
    child.kill();
  });
});
