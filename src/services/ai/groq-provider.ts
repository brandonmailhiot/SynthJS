import type { AIProvider, ChatMessage, CompleteOptions } from "./provider.js";

/**
 * Hosted provider backed by Groq's OpenAI-compatible chat-completions
 * endpoint. Free tier with generous daily limits — the closest thing to
 * "free + capable" available right now. Quality jump from a 3B browser
 * model to Llama-3.3-70B is large for any creative composition task.
 *
 * The user supplies a personal API key via the demo's settings panel; the
 * key is held in memory only (caller persists it to localStorage where
 * appropriate). No key is ever sent anywhere except `api.groq.com`.
 *
 * Implementation reuses the OpenAI SSE streaming format Groq exposes.
 */

const DEFAULT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "llama-3.3-70b-versatile";

export type GroqProviderOptions = {
  apiKey: string;
  model?: string;
  endpoint?: string;
};

export class GroqProvider implements AIProvider {
  readonly id = "groq";
  readonly label = "Groq (Llama 3.3 70B)";
  private readonly modelId: string;
  private readonly endpoint: string;
  private apiKey: string;

  constructor(opts: GroqProviderOptions) {
    this.apiKey = opts.apiKey;
    this.modelId = opts.model ?? DEFAULT_MODEL;
    this.endpoint = opts.endpoint ?? DEFAULT_ENDPOINT;
  }

  isReady(): boolean {
    return this.apiKey.length > 0;
  }

  async *chat(messages: ChatMessage[], opts: CompleteOptions = {}): AsyncIterable<string> {
    if (!this.apiKey) {
      throw new Error("Groq provider is missing an API key");
    }
    const body: Record<string, unknown> = {
      model: this.modelId,
      messages,
      stream: true,
    };
    if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;

    const init: RequestInit = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    };
    if (opts.signal) init.signal = opts.signal;

    const res = await fetch(this.endpoint, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Groq HTTP ${res.status}: ${text || res.statusText}`);
    }
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Groq response had no body to stream");

    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      if (opts.signal?.aborted) {
        try {
          await reader.cancel();
        } catch {}
        throw new DOMException("Aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Server-Sent Events frames are separated by a blank line ("\n\n").
      // Each event line begins with "data: ". Some lines are heartbeats or
      // metadata; we only care about JSON deltas.
      while (true) {
        const frameEnd = buffer.indexOf("\n\n");
        if (frameEnd === -1) break;
        const frame = buffer.slice(0, frameEnd);
        buffer = buffer.slice(frameEnd + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") return;
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload) as {
              choices?: { delta?: { content?: string } }[];
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch {
            // Ignore malformed frames — keep streaming.
          }
        }
      }
    }
  }

  complete(prompt: string, opts: CompleteOptions = {}): AsyncIterable<string> {
    return this.chat([{ role: "user", content: prompt }], opts);
  }
}
