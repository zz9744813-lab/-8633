import { db } from "./index";
import { worlds, agents as agentsTable, buildings as buildingsTable, memories } from "./schema";
import { eq, desc, sql } from "drizzle-orm";
import { World } from "@/lib/agent/world";
import { Agent, DailyPlan } from "@/lib/agent/agent";
import { AgentIdentity, AgentState, Building, BuildingType, Position } from "@/lib/types";
import { loadEraPack } from "@/lib/era-pack/loader";

export interface WorldSnapshot {
  id: string;
  name: string;
  width: number;
  height: number;
  tickCount: number;
  speed: number;
  paused: boolean;
  eraPackId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedAgent {
  id: string;
  identity: AgentIdentity;
  state: AgentState;
  dailyPlan: DailyPlan | null;
  lastPlanTick: number;
}

export interface SerializedWorld {
  id: string;
  name: string;
  width: number;
  height: number;
  tickCount: number;
  speed: number;
  paused: boolean;
  eraPackId: string | null;
  agents: SerializedAgent[];
  buildings: Building[];
}

export class WorldRepository {
  // Save world state to database
  async saveWorld(world: World): Promise<void> {
    const now = new Date();

    // Upsert world record
    await db
      .insert(worlds)
      .values({
        id: world.id,
        name: world.name,
        width: world.width,
        height: world.height,
        tickCount: world.tickCount,
        speed: world.speed,
        paused: world.paused,
        eraPackId: world.eraPack?.id ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: worlds.id,
        set: {
          name: world.name,
          tickCount: world.tickCount,
          speed: world.speed,
          paused: world.paused,
          updatedAt: now,
        },
      });

    // Save buildings
    for (const building of world.buildings) {
      await db
        .insert(buildingsTable)
        .values({
          id: building.id,
          worldId: world.id,
          type: building.type,
          name: building.name,
          position: building.position,
          width: building.width,
          height: building.height,
          x: building.position.x,
          y: building.position.y,
          w: building.width,
          h: building.height,
          ownerId: building.ownerId ?? null,
          description: building.description ?? null,
        })
        .onConflictDoUpdate({
          target: buildingsTable.id,
          set: {
            name: building.name,
            position: building.position,
            width: building.width,
            height: building.height,
            x: building.position.x,
            y: building.position.y,
            w: building.width,
            h: building.height,
            ownerId: building.ownerId ?? null,
            description: building.description ?? null,
          },
        });
    }

    // Save agents
    for (const [agentId, agent] of world.agents) {
      await db
        .insert(agentsTable)
        .values({
          id: agentId,
          worldId: world.id,
          name: agent.identity.name,
          age: agent.identity.age,
          occupation: agent.identity.occupation,
          backstory: agent.identity.backstory,
          personality: agent.identity.personality,
          identity: agent.identity,
          state: agent.state,
          dailyPlan: agent.dailyPlan,
          lastPlanTick: agent.lastPlanTick,
          positionX: agent.state.position.x,
          positionY: agent.state.position.y,
          currentActivity: agent.state.currentActivity,
          energy: agent.state.energy,
          mood: agent.state.mood,
          stress: agent.state.stress,
          status: agent.state.status,
          health: agent.state.health,
          portraitUrl: agent.identity.portraitUrl ?? null,
          x: agent.state.position.x,
          y: agent.state.position.y,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: agentsTable.id,
          set: {
            state: agent.state,
            dailyPlan: agent.dailyPlan,
            lastPlanTick: agent.lastPlanTick,
            positionX: agent.state.position.x,
            positionY: agent.state.position.y,
            currentActivity: agent.state.currentActivity,
            energy: agent.state.energy,
            mood: agent.state.mood,
            stress: agent.state.stress,
            status: agent.state.status,
            portraitUrl: agent.identity.portraitUrl ?? null,
            x: agent.state.position.x,
            y: agent.state.position.y,
            updatedAt: now,
          },
        });
    }
  }

  // Load world from database
  async loadWorld(worldId: string): Promise<SerializedWorld | null> {
    // Load world record
    const worldRecord = await db
      .select()
      .from(worlds)
      .where(eq(worlds.id, worldId))
      .limit(1);

    if (!worldRecord.length) {
      return null;
    }

    const world = worldRecord[0];

    // Load buildings
    const buildingRecords = await db
      .select()
      .from(buildingsTable)
      .where(eq(buildingsTable.worldId, worldId));

    const loadedBuildings: Building[] = buildingRecords.map((b: typeof buildingsTable.$inferSelect) => ({
      id: b.id,
      type: b.type as BuildingType,
      name: b.name ?? "",
      position: (b.position as Position) || { x: b.x || 0, y: b.y || 0 },
      width: (b.width || b.w || 1) as number,
      height: (b.height || b.h || 1) as number,
      ownerId: b.ownerId ?? undefined,
      description: b.description ?? undefined,
    }));

    // Load agents
    const agentRecords = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.worldId, worldId));

    const loadedAgents: SerializedAgent[] = agentRecords.map((a: typeof agentsTable.$inferSelect) => {
      const identity = (a.identity as AgentIdentity) || {
        name: a.name,
        age: a.age,
        occupation: a.occupation,
        backstory: a.backstory ?? undefined,
        personality: (a.personality as any) || { traits: [], values: [], quirks: [] },
      };

      const position: Position = (a.state as any)?.position || {
        x: a.positionX ?? a.x ?? 0,
        y: a.positionY ?? a.y ?? 0,
      };

      const loadedState = (a.state as AgentState) || {
        id: a.id,
        name: a.name,
        position,
        currentActivity: a.currentActivity ?? "idle",
        energy: a.energy ?? 70,
        mood: a.mood ?? 50,
        stress: a.stress ?? 30,
        health: 1.0,
        status: "alive",
      };
      // Ensure backward compatibility for agents saved before G1
      if (loadedState.health === undefined) loadedState.health = 1.0;
      if (!loadedState.status) loadedState.status = "alive";

      return {
        id: a.id,
        identity,
        state: loadedState,
        dailyPlan: (a.dailyPlan as DailyPlan | null) ?? null,
        lastPlanTick: a.lastPlanTick ?? 0,
      };
    });

    return {
      id: world.id,
      name: world.name,
      width: world.width ?? 800,
      height: world.height ?? 600,
      tickCount: world.tickCount ?? 0,
      speed: world.speed ?? 1,
      paused: world.paused ?? false,
      eraPackId: world.eraPackId,
      agents: loadedAgents,
      buildings: loadedBuildings,
    };
  }

  // Reconstruct World instance from serialized data
  async reconstructWorld(serialized: SerializedWorld): Promise<World> {
    // Load era pack if available
    let eraPack = null;
    if (serialized.eraPackId) {
      try {
        eraPack = await loadEraPack(serialized.eraPackId);
      } catch (error) {
        console.warn("[WorldRepository] Failed to load era pack:", error);
      }
    }

    // Create world
    const world = new World(
      serialized.id,
      serialized.name,
      serialized.width,
      serialized.height,
      eraPack
    );

    // Restore state
    world.tickCount = serialized.tickCount;
    world.speed = serialized.speed;
    world.paused = serialized.paused;

    // Add buildings
    for (const building of serialized.buildings) {
      world.addBuilding(building);
    }

    // Add agents
    for (const serializedAgent of serialized.agents) {
      const agent = world.addAgent(
        serializedAgent.id,
        serializedAgent.identity,
        serializedAgent.state.position,
        false // Don't record birth when loading existing agents
      );

      // Restore agent state
      agent.state = serializedAgent.state;
      agent.dailyPlan = serializedAgent.dailyPlan;
      agent.lastPlanTick = serializedAgent.lastPlanTick;
    }

    return world;
  }

  // List all saved worlds
  async listWorlds(): Promise<WorldSnapshot[]> {
    const records = await db
      .select({
        id: worlds.id,
        name: worlds.name,
        width: worlds.width,
        height: worlds.height,
        tickCount: worlds.tickCount,
        speed: worlds.speed,
        paused: worlds.paused,
        eraPackId: worlds.eraPackId,
        createdAt: worlds.createdAt,
        updatedAt: worlds.updatedAt,
      })
      .from(worlds)
      .orderBy(desc(worlds.updatedAt));

    return records.map((r: typeof worlds.$inferSelect) => ({
      id: r.id,
      name: r.name,
      width: r.width ?? 100,
      height: r.height ?? 100,
      tickCount: r.tickCount ?? 0,
      speed: r.speed ?? 1,
      paused: r.paused === true,
      eraPackId: r.eraPackId,
      createdAt: r.createdAt!,
      updatedAt: r.updatedAt!,
    }));
  }

  // Delete world and all related data
  async deleteWorld(worldId: string): Promise<void> {
    // Delete memories for all agents in this world
    const agentRecords = await db
      .select({ id: agentsTable.id })
      .from(agentsTable)
      .where(eq(agentsTable.worldId, worldId));

    for (const agent of agentRecords) {
      await db.delete(memories).where(eq(memories.agentId, agent.id));
    }

    // Delete agents
    await db.delete(agentsTable).where(eq(agentsTable.worldId, worldId));

    // Delete buildings
    await db.delete(buildingsTable).where(eq(buildingsTable.worldId, worldId));

    // Delete world
    await db.delete(worlds).where(eq(worlds.id, worldId));
  }

  // Check if world exists
  async worldExists(worldId: string): Promise<boolean> {
    const result = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(worlds)
      .where(eq(worlds.id, worldId));

    return (result[0]?.count ?? 0) > 0;
  }
}

// Global instance
export const worldRepository = new WorldRepository();
