import { Memory, AgentState } from "@/lib/types";
import {
  MemoryRepository,
  reflectionRepo,
  CreateMemoryInput,
  memoryRepo,
} from "@/db/memory-repository";
import { vectorMemoryStore, VectorMemory } from "@/db/vector-memory";
import { getLLMClient } from "@/lib/llm/client";
import { z } from "zod";

// In-memory cache for STM (Short-Term Memory)
const stmCache: Map<string, Memory[]> = new Map();
const STM_CACHE_SIZE = 20;
const STM_TICK_WINDOW = 50;

export class MemoryManager {
  private repo: MemoryRepository;

  constructor(repo: MemoryRepository = memoryRepo) {
    this.repo = repo;
  }

  // Add a new memory (stores to DB and caches in STM)
  async addMemory(input: CreateMemoryInput): Promise<Memory> {
    const memory = await this.repo.create(input);

    // Update STM cache
    const agentStm = stmCache.get(input.agentId) || [];
    agentStm.push(memory);

    // Enforce STM size limit
    if (agentStm.length > STM_CACHE_SIZE) {
      agentStm.shift();
    }
    stmCache.set(input.agentId, agentStm);

    return memory;
  }

  // Get all memories for an agent (from DB)
  async getAllMemories(agentId: string): Promise<Memory[]> {
    return await this.repo.getByAgent(agentId);
  }

  // Get STM (recent + important from cache, fallback to DB)
  async getSTM(agentId: string, currentTick: number, limit: number = 20): Promise<Memory[]> {
    // Try cache first for very recent
    const cached = stmCache.get(agentId) || [];
    const recentCached = cached.filter((m) => currentTick - m.tick < STM_TICK_WINDOW);

    if (recentCached.length >= limit) {
      return recentCached.slice(-limit).reverse();
    }

    // Load from DB
    const dbMemories = await this.repo.getSTM(agentId, currentTick, limit);

    // Update cache
    stmCache.set(agentId, dbMemories.slice(0, STM_CACHE_SIZE));

    return dbMemories;
  }

  // Get LTM (important memories from DB)
  async getLTM(agentId: string, currentTick: number, limit: number = 30): Promise<Memory[]> {
    return await this.repo.getLTM(agentId, currentTick, limit);
  }

  // Search memories
  async searchMemories(agentId: string, query: string): Promise<Memory[]> {
    return await this.repo.search(agentId, query);
  }

  // Get memories about specific agents
  async getMemoriesAbout(agentId: string, targetAgentIds: string[]): Promise<Memory[]> {
    return await this.repo.getRelatedToAgents(agentId, targetAgentIds);
  }

  // Access a memory (updates last accessed)
  async accessMemory(memoryId: string, currentTick: number): Promise<void> {
    await this.repo.updateLastAccessed(memoryId, currentTick);
  }

  // Decay old memories
  async decayMemories(agentId: string, currentTick: number): Promise<number> {
    // Clear old cache entries
    const stm = stmCache.get(agentId);
    if (stm) {
      const valid = stm.filter((m) => currentTick - m.tick < STM_TICK_WINDOW);
      if (valid.length !== stm.length) {
        stmCache.set(agentId, valid);
      }
    }

    // Decay DB memories (keep top 100)
    return await this.repo.decay(agentId, currentTick, 100);
  }

  // Clear agent memories
  async clearMemories(agentId: string): Promise<void> {
    stmCache.delete(agentId);
    await this.repo.clear(agentId);
  }

  // Get memory count
  async getMemoryCount(agentId: string): Promise<number> {
    return await this.repo.getCount(agentId);
  }

  // Retrieve relevant memories using semantic search
  async retrieveRelevant(
    agentId: string,
    query: string,
    limit: number = 5,
    useVectorSearch: boolean = true
  ): Promise<VectorMemory[]> {
    if (useVectorSearch && vectorMemoryStore.isAvailable()) {
      return await vectorMemoryStore.hybridSearch(agentId, query, limit, 0.6);
    } else {
      // Fallback to text search
      const memories = await this.repo.search(agentId, query, limit);
      return memories.map((m) => ({
        memoryId: m.id,
        agentId: m.agentId,
        content: m.content,
        embedding: [],
        importance: m.importance,
        tick: m.tick,
        similarity: 0.5,
      }));
    }
  }

  // Store embedding for a memory (call this after creating a memory)
  async storeMemoryEmbedding(memory: Memory): Promise<void> {
    await vectorMemoryStore.storeMemoryEmbedding(memory);
  }
}

// Reflection result with optional goal updates
export interface ReflectionResult {
  insight: string;
  goalUpdates?: {
    add?: string[];
    remove?: string[];
  };
}

// Reflection engine
export class ReflectionEngine {
  private memoryManager: MemoryManager;

  constructor(memoryManager: MemoryManager = new MemoryManager()) {
    this.memoryManager = memoryManager;
  }

  // Generate reflection based on recent experiences
  async reflect(
    agentId: string,
    agentState: AgentState,
    currentTick: number
  ): Promise<ReflectionResult | null> {
    const recentMemories = await this.memoryManager.getSTM(agentId, currentTick, 30);

    if (recentMemories.length < 10) {
      return null; // Not enough experiences
    }

    // Use LLM to generate reflection
    try {
      const llm = getLLMClient();

      const memorySummary = recentMemories
        .slice(0, 15)
        .map((m) => `- ${m.type}: ${m.content}`)
        .join("\n");

      const currentGoals = agentState.currentGoals || [];

      const systemPrompt = `You are analyzing a person's recent experiences to identify patterns or insights.
Generate a brief reflection (1-2 sentences) about what this person might be noticing or learning.
Be specific and grounded in the experiences.

Also evaluate their current long-term goals and decide if any should be:
- Added (new ambitions that emerged from recent experiences)
- Removed (goals that were completed, abandoned, or no longer relevant)

Return JSON with the reflection and any goal updates.`;

      const prompt = `Recent experiences:
${memorySummary}

Current long-term goals:
${currentGoals.length > 0 ? currentGoals.map((g, i) => `${i + 1}. ${g}`).join("\n") : "暂无明确长期目标"}

What pattern or insight might this person have? Should their goals be updated?`;

      const ReflectionSchema = z.object({
        insight: z.string().describe("1-2 sentences reflection on recent experiences"),
        goalUpdates: z.object({
          add: z.array(z.string()).optional().describe("New goals to add based on recent experiences"),
          remove: z.array(z.string()).optional().describe("Goals to remove (completed or abandoned)"),
        }).optional(),
      });

      const result = await llm.generateObject(prompt, ReflectionSchema, systemPrompt);

      const trimmedInsight = result.insight.trim();

      // Store as reflection in DB
      const sourceIds = recentMemories.map((m) => m.id);
      await reflectionRepo.create(
        agentId,
        trimmedInsight,
        sourceIds,
        currentTick,
        "behavior_preference"
      );

      // Also store as high-importance memory
      await this.memoryManager.addMemory({
        agentId,
        type: "reflection",
        content: trimmedInsight,
        importance: 0.8,
        tick: currentTick,
      });

      return {
        insight: trimmedInsight,
        goalUpdates: result.goalUpdates,
      };
    } catch (error) {
      console.error("Reflection generation failed:", error);
      return null;
    }
  }

  // Get reflections for an agent
  async getReflections(agentId: string, limit: number = 10) {
    return await reflectionRepo.getByAgent(agentId, limit);
  }

  // Check if agent should reflect (every ~100 ticks)
  shouldReflect(currentTick: number, lastReflectionTick?: number): boolean {
    if (!lastReflectionTick) return currentTick > 50;
    return currentTick - lastReflectionTick >= 100;
  }
}

// Global instances
export const memoryManager = new MemoryManager();
export const reflectionEngine = new ReflectionEngine();
