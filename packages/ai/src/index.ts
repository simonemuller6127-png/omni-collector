export const PACKAGE_NAME = "@omni/ai";
export {
  OpenAICompatibleProvider,
  DeepSeekProvider,
  OpenAIProvider,
  createProvider,
} from "./provider.js";
export type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ProviderConfig,
  ProviderType,
} from "./provider.js";
export {
  AiQueueProcessor,
  inputHash,
  buildPrompt,
  buildCommentContext,
  buildManualPrompt,
  parseSuggestions,
  parseTagPayload,
  parseBatchSuggestions,
  CONTENT_TYPES,
  DEFAULT_COMMENT_CONTEXT_LIMIT,
} from "./queue-processor.js";
export type {
  AiQueueDeps,
  AiQueueRunResult,
  BatchReplyEntry,
  ContentType,
  ParsedSuggestion,
  QueueItemComment,
  QueueItemWithContent,
  SuggestionType,
} from "./queue-processor.js";
