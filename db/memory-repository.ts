import { db } from "./index";
import { memories, reflections, Memory } from "./schema";
import { eq, and, desc, sql, notInArray } from "drizzle-orm";
import { vectorMemoryStore } from "./vector-memory";

export type MemoryType = "observation" | "event" | "dialogue" | "reflection" | "plan" | "rumor";

export interface CreateMemoryInput {
  agentId: string;
  type: MemoryType;
  content: string;
  importance: number;
  tick: number;
  relatedAgentIds?: string[];
  locationId?: string;
  metadata?: Record<string, unknown>;
}

// STM: Short-term memory (last ~50 ticks)
const STM_TICK_WINDOW = 50;

// LTM threshold for importance
const LTM_IMPORTANCE_THRESHOLD = 0.6;

// Max STM size per agent
const MAX_STM_SIZE = 50;

export class MemoryRepository {
  // Create a new memory
  async create(input: CreateMemoryInput): Promise<Memory> {
    const memory: Memory = {
      id: generateId(),
      agentId: input.agentId,
      type: input.type,
      content: input.content,
      importance: input.importance,
      tick: input.tick,
      lastAccessedTick: input.tick,
      embeddingId: null,
      relatedAgentIds: input.relatedAgentIds || [],
      locationId: input.locationId || null,
    };

    await db.insert(memories).values(memory);

    // Store vector embedding for semantic search
    try {
      await vectorMemoryStore.storeMemoryEmbedding(memory);
    } catch (error) {
      console.warn("[MemoryRepository] Failed to store embedding:", error);
    }

    return memory;
  }

  // Get memory by ID
  async getById(id: string): Promise<Memory | null> {
    const result = await db.select().from(memories).where(eq(memories.id, id));
    return result[0] || null;
  }

  // Get all memories for an agent
  async getByAgent(agentId: string): Promise<Memory[]> {
    return await db
      .select()
      .from(memories)
      .where(eq(memories.agentId, agentId))
      .orderBy(desc(memories.tick));
  }

  // Get short-term memories (recent and high importance)
  async getSTM(agentId: string, currentTick: number, limit: number = 20): Promise<Memory[]> {
    const stmWindow = currentTick - STM_TICK_WINDOW;

    return await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.agentId, agentId),
          sql`${memories.tick} > ${stmWindow} OR ${memories.importance} >= ${LTM_IMPORTANCE_THRESHOLD}`
        )
      )
      .orderBy(desc(memories.importance), desc(memories.tick))
      .limit(limit);
  }

  // Get long-term memories (high importance, accessed recently)
  async getLTM(agentId: string, currentTick: number, limit: number = 30): Promise<Memory[]> {
    return await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.agentId, agentId),
          sql`${memories.importance} >= ${LTM_IMPORTANCE_THRESHOLD}`
        )
      )
      .orderBy(desc(memories.lastAccessedTick), desc(memories.importance))
      .limit(limit);
  }

  // Search memories by content (simple text search)
  async search(agentId: string, query: string, limit: number = 10): Promise<Memory[]> {
    const searchTerm = `%${query}%`;
    return await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.agentId, agentId),
          sql`LOWER(${memories.content}) LIKE LOWER(${searchTerm})`
        )
      )
      .orderBy(desc(memories.importance))
      .limit(limit);
  }

  // Get memories related to specific agents - JS filtering to avoid SQL injection
  async getRelatedToAgents(agentId: string, targetAgentIds: string[]): Promise<Memory[]> {
    const all = await db
      .select()
      .from(memories)
      .where(eq(memories.agentId, agentId))
      .orderBy(desc(memories.tick));

    return all.filter((m: { relatedAgentIds: unknown }) =>
      (m.relatedAgentIds as string[] | null)?.some((id) => targetAgentIds.includes(id))
    );
  }

  // Update last accessed tick
  async updateLastAccessed(memoryId: string, tick: number): Promise<void> {
    await db
      .update(memories)
      .set({ lastAccessedTick: tick })
      .where(eq(memories.id, memoryId));
  }

  // Delete old low-importance memories (memory decay)
  async decay(agentId: string, currentTick: number, keepCount: number = 100): Promise<number> {
    // Get memories to keep
    const memoriesToKeep = await db
      .select({ id: memories.id })
      .from(memories)
      .where(eq(memories.agentId, agentId))
      .orderBy(desc(memories.importance), desc(memories.tick))
      .limit(keepCount);

    const keepIds = memoriesToKeep.map((m: { id: string }) => m.id);

    if (keepIds.length === 0) {
      // No memories to keep, delete all for this agent
      const result = await db.delete(memories).where(eq(memories.agentId, agentId));
      return result.changes || 0;
    }

    // Delete others using notInArray
    const result = await db
      .delete(memories)
      .where(and(eq(memories.agentId, agentId), notInArray(memories.id, keepIds)));

    return result.changes || 0;
  }

  // Get memory count for agent
  async getCount(agentId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(memories)
      .where(eq(memories.agentId, agentId));
    return result[0]?.count || 0;
  }

  // Clear all memories for an agent
  async clear(agentId: string): Promise<void> {
    await db.delete(memories).where(eq(memories.agentId, agentId));
  }
}

export class ReflectionRepository {
  async create(
    agentId: string,
    content: string,
    sourceMemoryIds: string[],
    tick: number,
    patternType?: string
  ): Promise<void> {
    await db.insert(reflections).values({
      id: generateId(),
      agentId,
      content,
      sourceMemoryIds,
      patternType,
      createdTick: tick,
      lastAccessedTick: tick,
      importance: 0.8,
    });
  }

  async getByAgent(agentId: string, limit: number = 10): Promise<typeof reflections.$inferSelect[]> {
    return await db
      .select()
      .from(reflections)
      .where(eq(reflections.agentId, agentId))
      .orderBy(desc(reflections.createdTick))
      .limit(limit);
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Global instance
export const memoryRepo = new MemoryRepository();
export const reflectionRepo = new ReflectionRepository();
