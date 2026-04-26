export type ParsedMessage = { message: unknown; rest: string };

export function parseMessage(buffer: string): ParsedMessage | null {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;
  const header = buffer.slice(0, headerEnd);
  const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
  if (!lengthMatch) return null;
  const length = Number.parseInt(lengthMatch[1] ?? "0", 10);
  const bodyStart = headerEnd + 4;
  if (buffer.length < bodyStart + length) return null;
  const bodyBytes = buffer.slice(bodyStart, bodyStart + length);
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyBytes);
  } catch {
    return null;
  }
  return { message: parsed, rest: buffer.slice(bodyStart + length) };
}

export function frameMessage(message: unknown): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`;
}
