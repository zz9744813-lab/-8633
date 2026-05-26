import { db } from "./index";
import { chronicles, type Chronicle } from "./schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export type ChronicleType =
  | "birth"
  | "death"
  | "building"
  | "marriage"
  | "war"
  | "disaster"
  | "milestone"
  | "achievement";

export interface CreateChronicleInput {
  worldId: string;
  tick: number;
  year: number;
  season: string;
  day: number;
  type: ChronicleType;
  title: string;
  description: string;
  agentIds?: string[];
  buildingIds?: string[];
  importance?: number;
  metadata?: Record<string, unknown>;
}

export interface ChronicleFilter {
  worldId: string;
  year?: number;
  season?: string;
  type?: ChronicleType;
  minImportance?: number;
  limit?: number;
  offset?: number;
}

export class ChronicleRepository {
  // Create a new chronicle entry
  async create(input: CreateChronicleInput): Promise<Chronicle> {
    const id = uuidv4();

    await db.insert(chronicles).values({
      id,
      worldId: input.worldId,
      tick: input.tick,
      year: input.year,
      season: input.season,
      day: input.day,
      type: input.type,
      title: input.title,
      description: input.description,
      agentIds: input.agentIds ?? [],
      buildingIds: input.buildingIds ?? [],
      importance: input.importance ?? 0.5,
      metadata: input.metadata ?? {},
    });

    const result = await db
      .select()
      .from(chronicles)
      .where(eq(chronicles.id, id))
      .limit(1);

    return result[0];
  }

  // Get chronicle by ID
  async getById(id: string): Promise<Chronicle | null> {
    const result = await db
      .select()
      .from(chronicles)
      .where(eq(chronicles.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  // List chronicles with filtering
  async list(filter: ChronicleFilter): Promise<Chronicle[]> {
    let query = db
      .select()
      .from(chronicles)
      .where(eq(chronicles.worldId, filter.worldId));

    if (filter.year !== undefined) {
      query = query.where(eq(chronicles.year, filter.year));
    }

    if (filter.season) {
      query = query.where(eq(chronicles.season, filter.season));
    }

    if (filter.type) {
      query = query.where(eq(chronicles.type, filter.type));
    }

    if (filter.minImportance !== undefined) {
      query = query.where(gte(chronicles.importance, filter.minImportance));
    }

    query = query.orderBy(desc(chronicles.tick));

    if (filter.limit) {
      query = query.limit(filter.limit);
    }

    if (filter.offset) {
      query = query.offset(filter.offset);
    }

    return await query;
  }

  // Get chronicles grouped by year
  async getByYear(worldId: string, year: number): Promise<Chronicle[]> {
    return await db
      .select()
      .from(chronicles)
      .where(and(eq(chronicles.worldId, worldId), eq(chronicles.year, year)))
      .orderBy(desc(chronicles.tick));
  }

  // Get all years that have chronicles
  async getYears(worldId: string): Promise<number[]> {
    const result = await db
      .select({ year: chronicles.year })
      .from(chronicles)
      .where(eq(chronicles.worldId, worldId))
      .groupBy(chronicles.year)
      .orderBy(desc(chronicles.year));

    return result.map((r) => r.year);
  }

  // Get latest chronicles
  async getLatest(worldId: string, limit: number = 10): Promise<Chronicle[]> {
    return await db
      .select()
      .from(chronicles)
      .where(eq(chronicles.worldId, worldId))
      .orderBy(desc(chronicles.tick))
      .limit(limit);
  }

  // Get important events (for summary display)
  async getImportant(
    worldId: string,
    minImportance: number = 0.7,
    limit: number = 20
  ): Promise<Chronicle[]> {
    return await db
      .select()
      .from(chronicles)
      .where(
        and(
          eq(chronicles.worldId, worldId),
          gte(chronicles.importance, minImportance)
        )
      )
      .orderBy(desc(chronicles.tick))
      .limit(limit);
  }

  // Get chronicles involving a specific agent
  async getByAgent(agentId: string, limit: number = 50): Promise<Chronicle[]> {
    // Note: This uses JSON array containment check
    // SQLite doesn't have native JSON contains, so we use LIKE
    const likePattern = `%"${agentId}"%`;
    return await db
      .select()
      .from(chronicles)
      .where(chronicles.agentIds.like(likePattern))
      .orderBy(desc(chronicles.tick))
      .limit(limit);
  }

  // Delete chronicles for a world
  async clearWorld(worldId: string): Promise<void> {
    await db.delete(chronicles).where(eq(chronicles.worldId, worldId));
  }

  // Count chronicles
  async count(worldId: string): Promise<number> {
    const result = await db
      .select({ count: { value: chronicles.id } })
      .from(chronicles)
      .where(eq(chronicles.worldId, worldId));

    return result[0]?.count?.value ?? 0;
  }
}

// Global instance
export const chronicleRepo = new ChronicleRepository();
