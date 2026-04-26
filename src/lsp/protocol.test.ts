import { describe, expect, it } from "vitest";
import { frameMessage, parseMessage } from "./protocol.js";

describe("frameMessage", () => {
  it("encodes Content-Length header + JSON body", () => {
    const out = frameMessage({ jsonrpc: "2.0", id: 1, result: null });
    expect(out).toMatch(/Content-Length: \d+\r\n\r\n/);
    expect(out).toContain('"jsonrpc"');
  });

  it("Content-Length matches body byte length", () => {
    const msg = { hello: "world" };
    const out = frameMessage(msg);
    const m = out.match(/Content-Length: (\d+)/);
    const reportedLen = Number.parseInt(m?.[1] ?? "0", 10);
    const body = out.split("\r\n\r\n")[1] ?? "";
    expect(Buffer.byteLength(body, "utf-8")).toBe(reportedLen);
  });
});

describe("parseMessage", () => {
  it("returns null when header incomplete", () => {
    expect(parseMessage("Content-Length: 10")).toBeNull();
  });

  it("returns null when body short", () => {
    expect(parseMessage("Content-Length: 100\r\n\r\nshort")).toBeNull();
  });

  it("parses well-formed message", () => {
    const body = JSON.stringify({ a: 1 });
    const buf = `Content-Length: ${body.length}\r\n\r\n${body}`;
    const result = parseMessage(buf);
    expect(result).not.toBeNull();
    expect(result?.message).toEqual({ a: 1 });
    expect(result?.rest).toBe("");
  });

  it("preserves rest after one parsed message", () => {
    const body1 = JSON.stringify({ a: 1 });
    const body2 = JSON.stringify({ b: 2 });
    const buf = `Content-Length: ${body1.length}\r\n\r\n${body1}Content-Length: ${body2.length}\r\n\r\n${body2}`;
    const r1 = parseMessage(buf);
    expect(r1?.message).toEqual({ a: 1 });
    expect(r1?.rest.length).toBeGreaterThan(0);
    const r2 = parseMessage(r1?.rest ?? "");
    expect(r2?.message).toEqual({ b: 2 });
  });

  it("invalid JSON returns null", () => {
    const buf = "Content-Length: 7\r\n\r\nnot{json";
    expect(parseMessage(buf)).toBeNull();
  });
});
