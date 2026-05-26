import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, generateObject, LanguageModel } from "ai";
import { z } from "zod";

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
}

class LLMClientImpl implements LLMClient {
  private model: LanguageModel;

  constructor(config: LLMConfig) {
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
    const { text } = await generateText({
      model: this.model,
      prompt,
      system,
      temperature: 0.7,
      maxTokens: 2000,
    });
    return text;
  }

  async generateObject<T extends z.ZodType>(
    prompt: string,
    schema: T,
    system?: string
  ): Promise<z.infer<T>> {
    const { object } = await generateObject({
      model: this.model,
      prompt,
      schema,
      system,
      temperature: 0.7,
    });
    return object;
  }
}

// Global LLM client instance
let globalClient: LLMClient | null = null;

export function initLLM(config: LLMConfig): LLMClient {
  globalClient = new LLMClientImpl(config);
  return globalClient;
}

export function getLLMClient(): LLMClient {
  if (!globalClient) {
    throw new Error("LLM client not initialized. Call initLLM first.");
  }
  return globalClient;
}

export function isLLMInitialized(): boolean {
  return globalClient !== null;
}
