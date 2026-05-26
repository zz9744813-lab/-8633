import { db } from "./index";
import { worldEvents } from "./schema";
import { eq, desc } from "drizzle-orm";
import { getLLMClient } from "@/lib/llm/client";

export type WorldEventType = "weather" | "festival" | "disaster" | "intervention" | "news" | "illness";

export interface WorldEvent {
  id: string;
  worldId: string;
  tick: number;
  type: WorldEventType;
  description: string;
  payload?: Record<string, unknown>;
  witnessIds: string[];
  severity: number; // 0-10
}

export class WorldEventSystem {
  private lastEventTick: Map<string, number> = new Map();

  // Create a world event
  async createEvent(
    worldId: string,
    tick: number,
    type: WorldEventType,
    description: string,
    witnessIds: string[],
    payload?: Record<string, unknown>,
    severity: number = 5
  ): Promise<WorldEvent> {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await db.insert(worldEvents).values({
      id,
      worldId,
      tick,
      type,
      description,
      payload,
      witnessIds,
    });

    this.lastEventTick.set(worldId, tick);

    return {
      id,
      worldId,
      tick,
      type,
      description,
      payload,
      witnessIds,
      severity,
    };
  }

  // Get recent events for a world
  async getRecentEvents(worldId: string, limit: number = 10): Promise<WorldEvent[]> {
    const result = await db
      .select()
      .from(worldEvents)
      .where(eq(worldEvents.worldId, worldId))
      .orderBy(desc(worldEvents.tick))
      .limit(limit);

    return result.map((r) => ({
      id: r.id,
      worldId: r.worldId,
      tick: r.tick,
      type: r.type as WorldEventType,
      description: r.description,
      payload: (r.payload as Record<string, unknown>) || undefined,
      witnessIds: (r.witnessIds as string[]) || [],
      severity: 5,
    }));
  }

  // Generate a random world event using LLM
  async generateRandomEvent(
    worldId: string,
    tick: number,
    agentIds: string[],
    eraPack?: { worldPrompt: string } | null
  ): Promise<WorldEvent | null> {
    // Check if enough time has passed since last event (min 200 ticks)
    const lastTick = this.lastEventTick.get(worldId) || 0;
    if (tick - lastTick < 200) {
      return null;
    }

    // 20% chance to generate an event
    if (Math.random() > 0.2) {
      return null;
    }

    const llm = getLLMClient();

    // 15% chance for illness event
    if (Math.random() < 0.15) {
      const numSick = Math.max(1, Math.floor(agentIds.length * 0.3));
      const shuffled = [...agentIds].sort(() => Math.random() - 0.5);
      const sickAgents = shuffled.slice(0, Math.min(3, numSick));

      const description = sickAgents.length > 1
        ? `镇上多人染病，包括 ${sickAgents.length} 位居民`
        : `镇上有人染病`;

      return await this.createEvent(
        worldId,
        tick,
        "illness",
        description,
        sickAgents,
        { sickAgentIds: sickAgents },
        6
      );
    }

    const eventTypes: WorldEventType[] = ["weather", "festival", "disaster", "news"];
    const type = eventTypes[Math.floor(Math.random() * eventTypes.length)];

    let systemPrompt = "Generate a brief world event that affects the town.";
    if (eraPack) {
      systemPrompt += `\n\nContext: ${eraPack.worldPrompt}`;
    }

    const prompt = `Generate a ${type} event for a small town.
Keep it brief (1-2 sentences) and impactful.
Event should be something that the townspeople would notice and react to.`;

    try {
      const description = await llm.generateText(prompt, systemPrompt);

      // Select random witnesses (30% of agents)
      const numWitnesses = Math.max(1, Math.floor(agentIds.length * 0.3));
      const shuffled = [...agentIds].sort(() => Math.random() - 0.5);
      const witnesses = shuffled.slice(0, numWitnesses);

      const severity = type === "disaster" ? 8 : type === "festival" ? 6 : 4;

      return await this.createEvent(
        worldId,
        tick,
        type,
        description.trim(),
        witnesses,
        { type },
        severity
      );
    } catch (error) {
      console.error("[WorldEvent] Failed to generate event:", error);
      return null;
    }
  }

  // Get events witnessed by an agent
  async getEventsForAgent(agentId: string, worldId: string): Promise<WorldEvent[]> {
    const allEvents = await this.getRecentEvents(worldId, 50);
    return allEvents.filter((e) => e.witnessIds.includes(agentId));
  }
}

// Global instance
export const worldEventSystem = new WorldEventSystem();
