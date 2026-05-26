import { NextRequest, NextResponse } from "next/server";
import { createWorld, getWorld, destroyWorld, setWorld } from "@/lib/agent";
import { loadEraPack, generateAgentIdentity } from "@/lib/era-pack/loader";
import { AgentIdentity, Building } from "@/lib/types";

// POST /api/world - Create a new world
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, eraPackId = "18th_england", width = 800, height = 600, population = 3 } = body;

    if (!name) {
      return NextResponse.json({ error: "World name is required" }, { status: 400 });
    }

    // Load era pack
    const eraPack = await loadEraPack(eraPackId);
    if (!eraPack) {
      return NextResponse.json({ error: "Era pack not found" }, { status: 404 });
    }

    // Destroy existing world if any
    destroyWorld();

    // Create new world with era pack
    const world = createWorld(`world-${Date.now()}`, name, width, height, eraPack);

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

    // Start the simulation
    world.start();

    return NextResponse.json({ world: world.toJSON() });
  } catch (error) {
    console.error("Failed to create world:", error);
    return NextResponse.json(
      { error: "Failed to create world" },
      { status: 500 }
    );
  }
}

// GET /api/world - Get current world state
export async function GET() {
  const world = getWorld();

  if (!world) {
    return NextResponse.json({ world: null });
  }

  return NextResponse.json({ world: world.toJSON() });
}

// DELETE /api/world - Destroy current world
export async function DELETE() {
  destroyWorld();
  return NextResponse.json({ success: true });
}
