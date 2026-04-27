export type { AIProvider, ChatMessage, CompleteOptions } from "./provider.js";
export { completeText } from "./provider.js";
export { WebLLMProvider, type WebLLMProviderOptions } from "./webllm-provider.js";
export {
  buildPrompt,
  buildSystemPrompt,
  buildUserMessage,
  extractDslBlock,
  isTruncated,
  type BuildPromptArgs,
} from "./prompt-builder.js";
export { diffLines, formatDiff, type DiffSegment, type LineDiff } from "./diff.js";
export { mergeBlocks, type MergeResult } from "./merge.js";
