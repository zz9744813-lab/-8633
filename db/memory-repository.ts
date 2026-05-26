import { db } from "./index";
import { memories, Memory } from "./schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export type MemoryType = "observation" | "event" | "dialogue" | "reflection" | "plan";

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

  // Get memories related to specific agents
  async getRelatedToAgents(agentId: string, targetAgentIds: string[]): Promise<Memory[]> {
    return await db
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.agentId, agentId),
          sql`EXISTS (
            SELECT 1 FROM json_each(${memories.relatedAgentIds})
            WHERE json_each.value IN (${targetAgentIds.join(",")})
          )`
        )
      )
      .orderBy(desc(memories.tick));
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

    const keepIds = memoriesToKeep.map((m) => m.id);

    // Delete others
    const result = await db
      .delete(memories)
      .where(
        and(
          eq(memories.agentId, agentId),
          keepIds.length > 0 ? sql`${memories.id} NOT IN (${keepIds.join(",")})` : undefined
        )
      );

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

// Reflection records
export const reflections = sqliteTable("reflections", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").references(() => agents.id).notNull(),
  content: text("content").notNull(),
  patternType: text("pattern_type"), // behavior_preference/social_dynamic/goal_progress
  sourceMemoryIds: text("source_memory_ids", { mode: "json" }).$type<string[]>(),
  createdTick: integer("created_tick").notNull(),
  lastAccessedTick: integer("last_accessed_tick"),
  importance: real("importance").default(0.8),
});

import { sqliteTable } from "drizzle-orm/sqlite-core";
import { agents } from "./schema";

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
