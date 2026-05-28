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
  roleModels?: Partial<Record<LLMRole, string>>; // T1.3: Optional per-role model overrides
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
    // T5.2: Use concurrency limiter
    return concurrencyLimiter.run(async () => {
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
    });
  }

  async generateObject<T extends z.ZodType>(
    prompt: string,
    schema: T,
    system?: string
  ): Promise<z.infer<T>> {
    // T5.2: Use concurrency limiter
    return concurrencyLimiter.run(async () => {
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
    });
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

// T5.2: Concurrent LLM call limiter
class LLMConcurrencyLimiter {
  private maxConcurrent: number = 3;
  private currentRunning: number = 0;
  private queue: Array<{
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
    fn: () => Promise<any>;
  }> = [];

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.currentRunning < this.maxConcurrent) {
      return this.execute(fn);
    }

    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, fn });
    });
  }

  private async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.currentRunning++;
    try {
      const result = await fn();
      return result;
    } finally {
      this.currentRunning--;
      this.processQueue();
    }
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.currentRunning >= this.maxConcurrent) {
      return;
    }
    const next = this.queue.shift();
    if (next) {
      this.execute(next.fn).then(next.resolve).catch(next.reject);
    }
  }
}

// Global concurrency limiter
const concurrencyLimiter = new LLMConcurrencyLimiter(3);

// T1.3: Optional role-based model mapping (user can configure in roleModels)
// If not provided, uses the base model for all roles
function getModelForRole(role: LLMRole, baseConfig: LLMConfig): string {
  // If user provided roleModels mapping, use it
  if (baseConfig.roleModels && baseConfig.roleModels[role]) {
    return baseConfig.roleModels[role];
  }
  // Otherwise use the user's configured model
  return baseConfig.model;
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
      model: getModelForRole(role, config),
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
