import { LLMProvider } from "@/lib/llm/client";

export interface ModelConfig {
  id: string;
  name: string;
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface AppConfig {
  // LLM Models
  models: ModelConfig[];
  defaultModelId: string;

  // Embedding (for vector search)
  embeddingProvider: "ollama" | "openai";
  embeddingModel: string;
  embeddingApiKey?: string;
  embeddingBaseUrl?: string;

  // Simulation
  tickRateHz: number;
  gameMinutesPerTick: number;
  maxAgents: number;

  // World
  eraPackId?: string;

  // Features
  enableVectorSearch: boolean;
  enableReflections: boolean;
  enableDialogue: boolean;
  enableWorldEvents: boolean;

  // I1: AI Portraits
  falApiKey?: string;

  // Rate Limiting
  maxLLMCallsPerMinute: number;
  enableRateLimiting: boolean;
}

const DEFAULT_CONFIG: AppConfig = {
  models: [
    {
      id: "anthropic-claude",
      name: "Claude (Anthropic)",
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      enabled: false,
    },
    {
      id: "openai-gpt4",
      name: "GPT-4 (OpenAI)",
      provider: "openai",
      model: "gpt-4o",
      enabled: false,
    },
    {
      id: "ollama-local",
      name: "Ollama (Local)",
      provider: "ollama",
      model: "qwen2.5:14b",
      baseUrl: "http://localhost:11434/v1",
      enabled: true,
    },
  ],
  defaultModelId: "ollama-local",

  embeddingProvider: "ollama",
  embeddingModel: "nomic-embed-text",
  embeddingBaseUrl: "http://localhost:11434",

  tickRateHz: 1,
  gameMinutesPerTick: 10,
  maxAgents: 20,

  enableVectorSearch: true,
  enableReflections: true,
  enableDialogue: true,
  enableWorldEvents: true,

  maxLLMCallsPerMinute: 30,
  enableRateLimiting: true,

  falApiKey: "",
};

// Storage key
const CONFIG_KEY = "pixel-town-config";

// Load config from localStorage
export function loadConfig(): AppConfig {
  if (typeof window === "undefined") {
    return DEFAULT_CONFIG;
  }

  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (error) {
    console.error("[Config] Failed to load config:", error);
  }

  return DEFAULT_CONFIG;
}

// Save config to localStorage
export function saveConfig(config: AppConfig): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error("[Config] Failed to save config:", error);
  }
}

// Get active model config
export function getActiveModel(config: AppConfig): ModelConfig | null {
  const model = config.models.find((m) => m.id === config.defaultModelId && m.enabled);
  return model || config.models.find((m) => m.enabled) || null;
}

// Validate model config
export function validateModelConfig(model: ModelConfig): string[] {
  const errors: string[] = [];

  if (!model.model) {
    errors.push("Model name is required");
  }

  if (model.provider === "anthropic" && !model.apiKey) {
    errors.push("Anthropic API key is required");
  }

  if (model.provider === "openai" && !model.apiKey) {
    errors.push("OpenAI API key is required");
  }

  if (model.provider === "ollama" && !model.baseUrl) {
    errors.push("Ollama base URL is required");
  }

  return errors;
}

// Export config as JSON
export function exportConfig(config: AppConfig): string {
  return JSON.stringify(config, null, 2);
}

// Import config from JSON
export function importConfig(json: string): AppConfig | null {
  try {
    const parsed = JSON.parse(json);
    // Validate required fields
    if (parsed.models && Array.isArray(parsed.models)) {
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (error) {
    console.error("[Config] Failed to import config:", error);
  }
  return null;
}

// Reset to defaults
export function resetConfig(): AppConfig {
  if (typeof window !== "undefined") {
    localStorage.removeItem(CONFIG_KEY);
  }
  return DEFAULT_CONFIG;
}
