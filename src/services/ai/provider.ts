/**
 * Pluggable AI provider interface for DSL-generation tasks.
 *
 * Implementations adapt different model backends (WebLLM, Groq, Anthropic,
 * OpenAI, …) behind one streaming interface. Callers feed a prompt, receive
 * an async iterable of token chunks, and assemble the final string.
 *
 * The interface intentionally stays small. Provider-specific configuration
 * (model ID, API key, system temperature) lives behind each concrete factory.
 */

export type CompleteOptions = {
  /** Cap on total output tokens. Defaults are provider-specific. */
  maxTokens?: number;
  /** Sampling temperature (0..1+). Defaults are provider-specific. */
  temperature?: number;
  /** Aborts mid-stream when fired. */
  signal?: AbortSignal;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface AIProvider {
  /** Stable identifier — `"webllm"`, `"groq"`, `"anthropic"`, … */
  readonly id: string;
  /** Human-readable label for the settings UI. */
  readonly label: string;

  /**
   * Indicate whether the provider is ready to serve completions. WebLLM
   * returns false until its weights are downloaded; hosted providers return
   * true once an API key is set. UI surfaces this to drive a setup flow.
   */
  isReady(): boolean;

  /**
   * Optional one-time setup. Browser providers download model weights;
   * hosted providers may validate the API key. The returned async iterable
   * yields human-readable progress messages so the UI can show a loader.
   */
  prepare?(opts?: { signal?: AbortSignal }): AsyncIterable<string>;

  /**
   * Stream a chat completion for an array of role-tagged messages. Splitting
   * the system prompt from per-turn user content lets KV-caching providers
   * (WebLLM, OpenAI, Anthropic) reuse the encoded system prefix across
   * follow-up turns and avoid re-prefilling thousands of tokens each time.
   */
  chat(messages: ChatMessage[], opts?: CompleteOptions): AsyncIterable<string>;

  /**
   * Convenience for single-shot prompts. Default implementations wrap
   * `chat([{role: "user", content: prompt}])`.
   */
  complete(prompt: string, opts?: CompleteOptions): AsyncIterable<string>;
}

/**
 * Convenience helper — drains a streaming completion into a single string.
 */
export async function completeText(
  provider: AIProvider,
  prompt: string,
  opts?: CompleteOptions,
): Promise<string> {
  const parts: string[] = [];
  for await (const chunk of provider.complete(prompt, opts)) parts.push(chunk);
  return parts.join("");
}
