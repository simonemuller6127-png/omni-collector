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
export { AiQueueProcessor, inputHash, buildPrompt, parseSuggestions } from "./queue-processor.js";
export type {
  AiQueueDeps,
  AiQueueRunResult,
  ParsedSuggestion,
  QueueItemWithContent,
  SuggestionType,
} from "./queue-processor.js";
