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

    // Add default buildings from era pack
    const defaultBuildings: Building[] = [
      {
        id: "tavern",
        name: "酒馆",
        type: "social",
        position: { x: 200, y: 150 },
        width: 60,
        height: 50,
        description: "镇上的社交中心",
      },
      {
        id: "market",
        name: "集市",
        type: "commercial",
        position: { x: 500, y: 200 },
        width: 80,
        height: 60,
        description: "买卖商品的地方",
      },
      {
        id: "church",
        name: "教堂",
        type: "religious",
        position: { x: 350, y: 400 },
        width: 50,
        height: 70,
        description: "祈祷和礼拜的场所",
      },
      {
        id: "blacksmith",
        name: "铁匠铺",
        type: "crafting",
        position: { x: 600, y: 400 },
        width: 50,
        height: 40,
        description: "锻造工具和武器",
      },
    ];

    for (const building of defaultBuildings) {
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
