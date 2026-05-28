// Vector embedding generation for semantic search
// Supports multiple providers: Ollama, OpenAI

interface EmbeddingConfig {
  provider: "ollama" | "openai";
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

// T3.2: Model dimension mapping
const MODEL_DIMENSIONS: Record<string, number> = {
  // Ollama models
  "nomic-embed-text": 768,
  "all-minilm": 384,
  // OpenAI models
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

let currentEmbeddingConfig: EmbeddingConfig | null = null;

const DEFAULT_CONFIG: EmbeddingConfig = {
  provider: "ollama",
  model: "nomic-embed-text",
  baseUrl: "http://localhost:11434",
};

// Initialize embeddings with user config (called from API)
export function initEmbeddings(config: EmbeddingConfig): void {
  currentEmbeddingConfig = config;
  console.log(`[Embeddings] Initialized with ${config.provider}/${config.model}`);
}

function getConfig(): EmbeddingConfig {
  // Priority: initialized config > env vars > default
  if (currentEmbeddingConfig) {
    return currentEmbeddingConfig;
  }

  const provider = (process.env.EMBEDDING_PROVIDER as "ollama" | "openai") || "ollama";
  const model = process.env.EMBEDDING_MODEL || (provider === "ollama" ? "nomic-embed-text" : "text-embedding-3-small");
  const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.EMBEDDING_BASE_URL || (provider === "ollama" ? "http://localhost:11434" : undefined);

  return { provider, model, apiKey, baseUrl };
}

// T3.2: Get embedding dimension for current config
export function getEmbeddingDimension(): number {
  const config = getConfig();
  return MODEL_DIMENSIONS[config.model] || 768; // Default to 768
}

// Generate embedding for a single text
export async function generateEmbedding(text: string): Promise<number[]> {
  const config = getConfig();

  try {
    if (config.provider === "ollama") {
      return await generateOllamaEmbedding(text, config);
    } else {
      return await generateOpenAIEmbedding(text, config);
    }
  } catch (error) {
    console.error("[Embedding] Failed to generate embedding:", error);
    // T3.2: Return zero vector with correct dimension
    return new Array(getEmbeddingDimension()).fill(0);
  }
}

// Generate embeddings for multiple texts in batch
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const config = getConfig();

  try {
    if (config.provider === "ollama") {
      // Ollama doesn't support batch, do sequentially
      const embeddings: number[][] = [];
      for (const text of texts) {
        const embedding = await generateOllamaEmbedding(text, config);
        embeddings.push(embedding);
      }
      return embeddings;
    } else {
      return await generateOpenAIEmbeddingsBatch(texts, config);
    }
  } catch (error) {
    console.error("[Embedding] Failed to generate embeddings:", error);
    // T3.2: Return zero vectors with correct dimension
    const dim = getEmbeddingDimension();
    return texts.map(() => new Array(dim).fill(0));
  }
}

async function generateOllamaEmbedding(text: string, config: EmbeddingConfig): Promise<number[]> {
  const response = await fetch(`${config.baseUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      prompt: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.embedding;
}

async function generateOpenAIEmbedding(text: string, config: EmbeddingConfig): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

async function generateOpenAIEmbeddingsBatch(texts: string[], config: EmbeddingConfig): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data.map((item: { embedding: number[] }) => item.embedding);
}

// Convert embedding array to SQLite vec format (comma-separated string)
export function embeddingToSqliteVec(embedding: number[]): string {
  return JSON.stringify(embedding);
}

// Convert SQLite vec format back to array
export function sqliteVecToEmbedding(vecString: string): number[] {
  return JSON.parse(vecString);
}
