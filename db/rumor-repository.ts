import { db } from "./index";
import { rumors, type Rumor } from "./schema";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export type RumorType = "scandal" | "secret" | "event" | "relationship" | "achievement" | "danger";

export interface CreateRumorInput {
  worldId: string;
  originatorId?: string;
  tick: number;
  type: RumorType;
  subject: string;
  content: string;
  truthLevel: number; // 0-1, how true is this rumor
  spreadCount: number;
  knownByIds: string[];
  sourceMemoryId?: string;
}

export interface RumorSpread {
  rumorId: string;
  fromAgentId: string;
  toAgentId: string;
  tick: number;
  distortedContent?: string;
  distortionLevel: number; // 0-1, how much was the rumor changed
}

export class RumorRepository {
  // Create a new rumor
  async create(input: CreateRumorInput): Promise<Rumor> {
    const id = uuidv4();

    await db.insert(rumors).values({
      id,
      worldId: input.worldId,
      originatorId: input.originatorId,
      tick: input.tick,
      type: input.type,
      subject: input.subject,
      content: input.content,
      truthLevel: input.truthLevel,
      spreadCount: input.spreadCount,
      knownByIds: input.knownByIds,
      sourceMemoryId: input.sourceMemoryId,
    });

    const result = await db.select().from(rumors).where(eq(rumors.id, id)).limit(1);
    return result[0];
  }

  // Get rumor by ID
  async getById(id: string): Promise<Rumor | null> {
    const result = await db.select().from(rumors).where(eq(rumors.id, id)).limit(1);
    return result[0] ?? null;
  }

  // Get rumors known by an agent
  async getKnownByAgent(agentId: string, worldId: string): Promise<Rumor[]> {
    // Use JSON array containment check via LIKE
    const likePattern = `%"${agentId}"%`;
    return await db
      .select()
      .from(rumors)
      .where(and(eq(rumors.worldId, worldId), rumors.knownByIds.like(likePattern)))
      .orderBy(desc(rumors.tick));
  }

  // Get all rumors in a world
  async getWorldRumors(worldId: string, limit: number = 50): Promise<Rumor[]> {
    return await db
      .select()
      .from(rumors)
      .where(eq(rumors.worldId, worldId))
      .orderBy(desc(rumors.tick))
      .limit(limit);
  }

  // Update rumor spread
  async updateSpread(
    rumorId: string,
    newKnownByIds: string[],
    newSpreadCount: number,
    newContent?: string
  ): Promise<void> {
    await db
      .update(rumors)
      .set({
        knownByIds: newKnownByIds,
        spreadCount: newSpreadCount,
        ...(newContent && { content: newContent }),
      })
      .where(eq(rumors.id, rumorId));
  }

  // Get hot rumors (spread count > threshold)
  async getHotRumors(worldId: string, minSpread: number = 3): Promise<Rumor[]> {
    return await db
      .select()
      .from(rumors)
      .where(and(eq(rumors.worldId, worldId), gte(rumors.spreadCount, minSpread)))
      .orderBy(desc(rumors.spreadCount));
  }

  // Delete old rumors
  async cleanup(worldId: string, beforeTick: number): Promise<void> {
    await db
      .delete(rumors)
      .where(and(eq(rumors.worldId, worldId), rumors.tick.lessThan(beforeTick)));
  }
}

// Global instance
export const rumorRepo = new RumorRepository();
