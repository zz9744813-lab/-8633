import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, generateObject, LanguageModel } from "ai";
import { z } from "zod";
import { getRateLimiter } from "./rate-limiter";
import { usageTracker } from "./usage-tracker";

export type LLMProvider = "anthropic" | "openai" | "ollama";

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  baseUrl?: string; // For Ollama
  model: string;
}

export interface LLMClient {
  generateText(prompt: string, system?: string): Promise<string>;
  generateObject<T extends z.ZodType>(
    prompt: string,
    schema: T,
    system?: string
  ): Promise<z.infer<T>>;
  generateJSON<T>(prompt: string, system?: string): Promise<T>;
}

class LLMClientImpl implements LLMClient {
  private model: LanguageModel;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.model = this.createModel(config);
  }

  private createModel(config: LLMConfig): LanguageModel {
    switch (config.provider) {
      case "anthropic": {
        const provider = createAnthropic({ apiKey: config.apiKey });
        return provider(config.model);
      }
      case "openai": {
        const provider = createOpenAI({ apiKey: config.apiKey });
        return provider(config.model);
      }
      case "ollama": {
        const provider = createOpenAI({
          apiKey: "ollama",
          baseURL: config.baseUrl || "http://localhost:11434/v1",
        });
        return provider(config.model);
      }
      default:
        throw new Error(`Unknown provider: ${config.provider}`);
    }
  }

  async generateText(prompt: string, system?: string): Promise<string> {
    // Check rate limit
    const rateLimiter = getRateLimiter();
    if (rateLimiter) {
      const status = rateLimiter.canMakeCall();
      if (!status.allowed) {
        if (status.waitMs && status.waitMs < 30000) {
          await new Promise((resolve) => setTimeout(resolve, status.waitMs));
        } else {
          throw new Error(status.reason || "Rate limit exceeded");
        }
      }
      rateLimiter.recordCall("generateText");
    }

    const result = await generateText({
      model: this.model,
      prompt,
      system,
      temperature: 0.7,
      maxTokens: 2000,
    });
    // J4: Track usage
    const usage = (result as any).usage;
    if (usage) {
      usageTracker.recordCall(this.config.provider, this.config.model, usage.promptTokens ?? 0, usage.completionTokens ?? 0, "generateText");
    }
    return result.text;
  }

  async generateObject<T extends z.ZodType>(
    prompt: string,
    schema: T,
    system?: string
  ): Promise<z.infer<T>> {
    // Check rate limit
    const rateLimiter = getRateLimiter();
    if (rateLimiter) {
      const status = rateLimiter.canMakeCall();
      if (!status.allowed) {
        if (status.waitMs && status.waitMs < 30000) {
          await new Promise((resolve) => setTimeout(resolve, status.waitMs));
        } else {
          throw new Error(status.reason || "Rate limit exceeded");
        }
      }
      rateLimiter.recordCall("generateObject");
    }

    const result = await generateObject({
      model: this.model,
      prompt,
      schema,
      system,
      temperature: 0.7,
    });
    // J4: Track usage
    const usage = (result as any).usage;
    if (usage) {
      usageTracker.recordCall(this.config.provider, this.config.model, usage.promptTokens ?? 0, usage.completionTokens ?? 0, "generateObject");
    }
    return result.object;
  }

  // Generate JSON without schema validation (fallback for providers that don't support structured output)
  async generateJSON<T>(prompt: string, system?: string): Promise<T> {
    const enhancedPrompt = `${prompt}

Respond with a valid JSON object. Do not include markdown formatting or code blocks. Only output the raw JSON.`;

    const text = await this.generateText(enhancedPrompt, system);

    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch (e) {
        console.error("[LLM] Failed to parse JSON:", e, "Text:", text);
        throw new Error("Failed to parse JSON response");
      }
    }

    throw new Error("No JSON found in response");
  }
}

// Global LLM client instances
let currentConfig: LLMConfig | null = null;
const clients = new Map<string, LLMClient>();

export type LLMRole = "plan" | "reflect" | "dialogue" | "score" | "chronicle" | "drama";

const ROLE_MODEL_MAP: Record<LLMRole, string> = {
  plan: "claude-sonnet-4-5",
  reflect: "claude-sonnet-4-5",
  dialogue: "claude-haiku-4-5",
  score: "claude-haiku-4-5",
  chronicle: "claude-sonnet-4-5",
  drama: "claude-sonnet-4-5",
};

function getModelForRole(role: LLMRole, baseConfig: LLMConfig): string {
  if (baseConfig.provider === "ollama") return baseConfig.model;
  return ROLE_MODEL_MAP[role];
}

let globalClient: LLMClient | null = null;
const roleClients = new Map<LLMRole, LLMClient>();

export function initLLM(config: LLMConfig): LLMClient {
  currentConfig = config;
  clients.clear();
  roleClients.clear();
  const client = new LLMClientImpl(config);
  clients.set("plan", client);
  globalClient = client;
  roleClients.set("plan", client);
  return client;
}

export function getLLMClient(role: LLMRole = "plan"): LLMClient {
  if (!currentConfig) {
    throw new Error("LLM client not initialized. Call initLLM first.");
  }
  const key = `${role}-${currentConfig.provider}`;
  if (!clients.has(key)) {
    const roleModel = getModelForRole(role, currentConfig);
    const roleConfig = { ...currentConfig, model: roleModel };
    clients.set(key, new LLMClientImpl(roleConfig));
  }
  return clients.get(key)!;
}

export function getLLMClientFor(role: LLMRole): LLMClient {
  if (!roleClients.has(role)) {
    if (!globalClient) throw new Error("Init globalClient first");
    const config = (globalClient as any).config as LLMConfig;
    roleClients.set(role, new LLMClientImpl({
      ...config,
      model: ROLE_MODEL_MAP[role],
    }));
  }
  return roleClients.get(role)!;
}

export function isLLMInitialized(): boolean {
  return currentConfig !== null;
}

// Switch to a different model config
export function switchLLM(config: LLMConfig): LLMClient {
  initLLM(config);
  return getLLMClient();
}
