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
  newWord?: {
    word: string;
    meaning: string;
    etymology: string;
  } | null;
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
    currentTick: number,
    worldId?: string
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

[Languages/Habits]
If today you experienced something new or felt something for which existing words don't seem adequate,
you might invent a new word or phrase (1-3 syllables, catchy, era-appropriate).
Only do this if you genuinely feel a need for a new word — most days you won't.

Return JSON with the reflection, any goal updates, and optionally a new word.`;

      const H2_KNOWN_WORDS_KEY = `h2_known_${agentId}`;
      let knownWords: { word: string; meaning: string }[] = [];
      if (worldId) {
        try {
          const { lexiconRepo } = await import("@/db/lexicon-repository");
          const words = await lexiconRepo.getAgentWords(agentId);
          knownWords = words.map(w => ({ word: w.word, meaning: w.meaning }));
        } catch { /* no lexicon db yet */ }
      }

      const prompt = `Recent experiences:
${memorySummary}

Current long-term goals:
${currentGoals.length > 0 ? currentGoals.map((g, i) => `${i + 1}. ${g}`).join("\n") : "暂无明确长期目标"}

${knownWords.length > 0 ? `[Town slang you know]\n${knownWords.map(w => `"${w.word}" means ${w.meaning}`).join("\n")}` : ""}

What pattern or insight might this person have? Should their goals be updated?`;

      const ReflectionSchema = z.object({
        insight: z.string().describe("1-2 sentences reflection on recent experiences"),
        goalUpdates: z.object({
          add: z.array(z.string()).optional().describe("New goals to add"),
          remove: z.array(z.string()).optional().describe("Goals to remove"),
        }).optional(),
        newWord: z.object({
          word: z.string().describe("1-3 syllable catchy word"),
          meaning: z.string().describe("what this word means"),
          etymology: z.string().describe("why this word came about"),
        }).optional().nullable().describe("A new word you invented, or null"),
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

      // H2: Coin new word if LLM suggested one
      if (result.newWord && worldId) {
        try {
          const { lexiconRepo } = await import("@/db/lexicon-repository");
          const entry = await lexiconRepo.coinWord(
            worldId, result.newWord.word, result.newWord.meaning,
            agentId, currentTick
          );
          await lexiconRepo.learnWord(agentId, entry.id, null, currentTick, 1.0);
          await this.memoryManager.addMemory({
            agentId,
            type: "reflection",
            content: `你造了一个新词：「${result.newWord.word}」意为「${result.newWord.meaning}」`,
            importance: 0.7,
            tick: currentTick,
          });
          console.log(`[H2] ${agentId} coined "${result.newWord.word}" = "${result.newWord.meaning}"`);
        } catch (e) {
          console.error("[H2] Failed to coin word:", e);
        }
      }

      return {
        insight: trimmedInsight,
        goalUpdates: result.goalUpdates,
        newWord: result.newWord ?? null,
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
