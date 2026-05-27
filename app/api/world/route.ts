import { NextRequest, NextResponse } from "next/server";
import { createWorldOrLoad, getWorld, destroyWorld, setWorld } from "@/lib/agent";
import { loadEraPack, generateAgentIdentity } from "@/lib/era-pack/loader";
import { AgentIdentity, Building } from "@/lib/types";
import { generatePortrait } from "@/lib/sprite-generator";
import { worldRepository } from "@/db/world-repository";

export const dynamic = "force-dynamic";

// POST /api/world - Create or load a world
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, worldId, eraPackId = "18th_england", width = 800, height = 600, population = 3 } = body;

    // Generate a unique worldId if not provided
    const id = worldId || `world-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    if (!name) {
      return NextResponse.json({ error: "World name is required" }, { status: 400 });
    }

    // Load era pack
    const eraPack = await loadEraPack(eraPackId);
    if (!eraPack) {
      return NextResponse.json({ error: "Era pack not found" }, { status: 404 });
    }

    // Save current world state before switching
    const current = getWorld();
    if (current && current.id !== id) {
      current.stop();
      try {
        const { worldRepository } = await import("@/db/world-repository");
        await worldRepository.saveWorld(current);
      } catch (e) {
        console.error("[World] Failed to save before switch:", e);
      }
    }

    // Create or load world
    const world = await createWorldOrLoad(id, name, width, height, eraPack);

    // If world was loaded from DB, skip buildings/agents (already have them)
    if (world.agents.size > 0) {
      console.log(`[World] Loaded existing world "${worldId}" with ${world.agents.size} agents at tick ${world.tickCount}`);
    } else {
      // Add buildings from era pack
      const buildings: Building[] = eraPack.buildingTypes.map((bt, i) => {
        // Simple grid layout
        const col = i % 4;
        const row = Math.floor(i / 4);
        return {
          id: bt.id,
          name: bt.name,
          type: bt.type as any,
          position: { x: 100 + col * 180, y: 100 + row * 200 },
          width: 60,
          height: 60,
          description: bt.visual ?? "",
        };
      });

      for (const building of buildings) {
        world.addBuilding(building);
      }

      // Generate agents using era pack
      for (let i = 0; i < population; i++) {
        const identity = generateAgentIdentity(eraPack);
        const agentIdentity: AgentIdentity = {
          name: identity.name,
          age: identity.age,
          gender: identity.gender,
          occupation: identity.occupation.name,
          personality: {
            traits: identity.personality,
            values: ["家庭", "诚实"],
            quirks: [],
          },
          backstory: `${identity.occupation.description}，${identity.age}岁`,
          appearance: {
            description: "普通外表",
            hairColor: "棕色",
            skinTone: "白皙",
            distinguishingFeatures: [],
          },
          initialGoals: ["谋生", "社交"],
        };
        world.addAgent(`agent-${i}-${Date.now()}`, agentIdentity);
      }
    }

    // Start the simulation
    world.start();

    // I1: Async portrait generation for all agents (non-blocking)
    const eraName = eraPack?.id ?? undefined;
    generatePortraitsForWorld(world, eraName).catch(() => {});

    return NextResponse.json({ world: world.toJSON() });
  } catch (error) {
    console.error("Failed to create world:", error);
    return NextResponse.json(
      { error: "Failed to create world" },
      { status: 500 }
    );
  }
}

// GET /api/world - Get current world state (loads from DB if not in memory)
export async function GET() {
  let world = getWorld();

  if (!world) {
    try {
      const { worldRepository } = await import("@/db/world-repository");
      const worlds = await worldRepository.listWorlds();
      if (worlds.length > 0) {
        const latest = worlds[0];
        const { createWorldOrLoad } = await import("@/lib/agent");
        world = await createWorldOrLoad(latest.id, latest.name, latest.width, latest.height, null);
        console.log(`[World] Loaded latest world "${latest.name}" from DB: ${world?.agents.size ?? 0} agents at tick ${world?.tickCount}`);
      }
    } catch (e) {
      console.error("[World] Failed to load from DB:", e);
      world = null;
    }
  }

  if (!world) {
    return NextResponse.json({ world: null });
  }

  return NextResponse.json({ world: world.toJSON() });
}

// I1: Generate portraits for all agents in background
async function generatePortraitsForWorld(world: ReturnType<typeof getWorld>, eraName?: string) {
  if (!world) return;
  const config = await import("@/lib/config/store").then(m => m.loadConfig());
  const apiKey = config.falApiKey;
  if (!apiKey) return;

  for (const [id, agent] of world.agents) {
    if (agent.identity.portraitUrl) continue;
    const url = await generatePortrait(
      agent.identity.name,
      agent.identity.occupation,
      agent.identity.gender,
      apiKey,
      eraName,
      agent.identity.appearance
    );
    if (url) {
      agent.identity.portraitUrl = url;
      try { await worldRepository.saveWorld(world); } catch {}
    }
  }
}

// DELETE /api/world - Destroy current world
export async function DELETE() {
  destroyWorld();
  return NextResponse.json({ success: true });
}
