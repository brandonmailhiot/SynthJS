import type { AIProvider, ChatMessage, CompleteOptions } from "./provider.js";

/**
 * Browser-local provider backed by WebLLM (https://github.com/mlc-ai/web-llm).
 * Runs a small open-weights model entirely in the browser via WebGPU. Zero
 * signup, zero per-request cost, fully offline once the weights are cached.
 *
 * Trade-offs: small models (1-3B) are competent at constrained DSL tasks
 * (chord suggestions, mode-aware fills) but struggle with long, free-form
 * generation. The settings panel surfaces an upgrade path to hosted
 * providers (Groq, Anthropic, OpenAI) for heavier work.
 *
 * Implementation note: WebLLM is loaded dynamically the first time
 * `prepare()` is called so the rest of the runtime never pays its bundle
 * cost. The library lives behind a string import that callers map at
 * runtime (e.g. via the demo's import map).
 */

export type WebLLMProviderOptions = {
  /** Model identifier as understood by WebLLM. Defaults to a small, fast 3B chat model. */
  model?: string;
  /**
   * Module specifier or URL for `@mlc-ai/web-llm`. The demo overrides this
   * via the page's import map. Production callers can also pre-import the
   * library and pass the module here directly.
   */
  webllmSpecifier?: string;
  /**
   * Override the context window size (in tokens). WebLLM defaults to 4096
   * for many models, which is too tight for our DSL workflow once the
   * grammar primer + composition + auto-continue assistant feedback are
   * stacked together. Default 16384 leaves comfortable headroom while
   * staying well below browser memory limits.
   */
  contextWindowSize?: number;
};

const DEFAULT_MODEL = "Llama-3.2-3B-Instruct-q4f16_1-MLC";
const DEFAULT_SPECIFIER = "@mlc-ai/web-llm";
const DEFAULT_CONTEXT_WINDOW = 16384;

type ChatChunk = {
  choices?: { delta?: { content?: string } }[];
};

type StreamLike = AsyncIterable<ChatChunk> | Promise<AsyncIterable<ChatChunk>>;

type ChatEngine = {
  reload?: (modelId: string, opts?: unknown) => Promise<void>;
  chat: {
    completions: {
      create: (req: {
        messages: { role: string; content: string }[];
        stream: true;
        max_tokens?: number;
        temperature?: number;
      }) => StreamLike;
    };
  };
};

type WebLLMModule = {
  CreateMLCEngine: (
    modelId: string,
    engineConfig?: { initProgressCallback?: (p: { progress: number; text: string }) => void },
    chatOpts?: { context_window_size?: number; sliding_window_size?: number },
  ) => Promise<ChatEngine>;
};

export class WebLLMProvider implements AIProvider {
  readonly id = "webllm";
  readonly label = "WebLLM (browser, offline)";

  private readonly modelId: string;
  private readonly specifier: string;
  private readonly contextWindowSize: number;
  private engine: ChatEngine | null = null;
  private preparing: Promise<void> | null = null;

  constructor(opts: WebLLMProviderOptions = {}) {
    this.modelId = opts.model ?? DEFAULT_MODEL;
    this.specifier = opts.webllmSpecifier ?? DEFAULT_SPECIFIER;
    this.contextWindowSize = opts.contextWindowSize ?? DEFAULT_CONTEXT_WINDOW;
  }

  isReady(): boolean {
    return this.engine !== null;
  }

  async *prepare(opts: { signal?: AbortSignal } = {}): AsyncIterable<string> {
    if (this.engine) {
      yield "ready";
      return;
    }
    // Buffer progress messages from WebLLM's callback into a queue we can
    // yield to the caller. WebLLM only exposes callbacks, so we adapt to an
    // async iterable here.
    const messages: string[] = [];
    let resolveMessage: (() => void) | null = null;
    let done = false;

    const queue = (text: string) => {
      messages.push(text);
      resolveMessage?.();
      resolveMessage = null;
    };

    const ensureLoaded = async () => {
      if (this.preparing) return this.preparing;
      this.preparing = (async () => {
        const mod = (await import(/* @vite-ignore */ this.specifier)) as WebLLMModule;
        this.engine = await mod.CreateMLCEngine(
          this.modelId,
          {
            initProgressCallback: (p) =>
              queue(p.text || `loading… ${(p.progress * 100).toFixed(0)}%`),
          },
          { context_window_size: this.contextWindowSize },
        );
      })();
      return this.preparing;
    };

    const loadPromise = ensureLoaded()
      .then(() => {
        queue("ready");
        done = true;
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        queue(`error: ${message}`);
        done = true;
        throw err;
      });

    while (!done || messages.length > 0) {
      if (opts.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      while (messages.length > 0) {
        const next = messages.shift();
        if (next !== undefined) yield next;
      }
      if (done) break;
      await new Promise<void>((resolve) => {
        resolveMessage = resolve;
      });
    }

    // Surface load errors to the caller.
    await loadPromise;
  }

  async *chat(messages: ChatMessage[], opts: CompleteOptions = {}): AsyncIterable<string> {
    if (!this.engine) {
      // Drain prepare() so callers can invoke chat() directly. Progress
      // messages are namespaced with a sentinel prefix the chat UI strips.
      for await (const msg of this.prepare({ ...(opts.signal ? { signal: opts.signal } : {}) })) {
        yield `[loading] ${msg}`;
      }
    }
    const engine = this.engine;
    if (!engine) throw new Error("WebLLM engine failed to initialize");

    const streamOrPromise = engine.chat.completions.create({
      messages,
      stream: true,
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    });
    // WebLLM versions vary: some return AsyncIterable directly, others
    // return a Promise<AsyncIterable>. Await defensively so either works.
    const stream: AsyncIterable<ChatChunk> =
      typeof (streamOrPromise as { then?: unknown }).then === "function"
        ? await (streamOrPromise as Promise<AsyncIterable<ChatChunk>>)
        : (streamOrPromise as AsyncIterable<ChatChunk>);

    for await (const chunk of stream) {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  complete(prompt: string, opts: CompleteOptions = {}): AsyncIterable<string> {
    return this.chat([{ role: "user", content: prompt }], opts);
  }
}
