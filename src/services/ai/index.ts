export type { AIProvider, CompleteOptions } from "./provider.js";
export { completeText } from "./provider.js";
export { WebLLMProvider, type WebLLMProviderOptions } from "./webllm-provider.js";
export { buildPrompt, extractDslBlock, type BuildPromptArgs } from "./prompt-builder.js";
export { diffLines, formatDiff, type DiffSegment, type LineDiff } from "./diff.js";
