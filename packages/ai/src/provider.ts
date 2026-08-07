/**
 * AI Provider 统一接口（TDD Part 5.2 / SPEC S9.4，ADR 原则：业务不耦合第三方 SDK）。
 * 接口风格参考主流插件 SDK（OpenAI 兼容 Chat Completions），可平滑替换 Provider。
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIProvider {
  readonly name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
}

export interface ProviderConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

interface CompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
}

/** OpenAI 兼容 Chat Completions 客户端（DeepSeek / OpenAI / 本地网关通用）。 */
export class OpenAICompatibleProvider implements AIProvider {
  readonly name: string;
  protected readonly baseURL: string;
  protected readonly model: string;
  protected readonly apiKey: string;

  constructor(
    name: string,
    protected readonly config: ProviderConfig,
    defaultBaseURL: string,
    defaultModel: string,
  ) {
    this.name = name;
    this.baseURL = (config.baseURL ?? defaultBaseURL).replace(/\/$/, "");
    this.model = config.model ?? defaultModel;
    this.apiKey = config.apiKey;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResponse> {
    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model ?? this.model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
      }),
    });
    const json = (await res.json()) as CompletionResponse;
    if (!res.ok || json.error) {
      throw new Error(`AI_001: provider ${this.name} error ${res.status}: ${json.error?.message ?? res.statusText}`);
    }
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new Error("AI_001: empty completion content");
    }
    return {
      text,
      usage: json.usage
        ? {
            promptTokens: json.usage.prompt_tokens ?? 0,
            completionTokens: json.usage.completion_tokens ?? 0,
            totalTokens: json.usage.total_tokens ?? 0,
          }
        : undefined,
    };
  }
}

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super("deepseek", config, "https://api.deepseek.com/v1", "deepseek-chat");
  }
}

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderConfig) {
    super("openai", config, "https://api.openai.com/v1", "gpt-4o-mini");
  }
}

export type ProviderType = "deepseek" | "openai";

export function createProvider(type: ProviderType, config: ProviderConfig): AIProvider {
  if (type === "openai") return new OpenAIProvider(config);
  return new DeepSeekProvider(config);
}
