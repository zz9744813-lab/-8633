import { NextRequest, NextResponse } from "next/server";
import { createWorld, getWorld, destroyWorld, setWorld } from "@/lib/agent";
import { AgentIdentity, Building } from "@/lib/types";

// POST /api/world - Create a new world
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, width = 800, height = 600 } = body;

    if (!name) {
      return NextResponse.json({ error: "World name is required" }, { status: 400 });
    }

    // Destroy existing world if any
    destroyWorld();

    // Create new world
    const world = createWorld(`world-${Date.now()}`, name, width, height);

    // Add default buildings
    const defaultBuildings: Building[] = [
      {
        id: "tavern",
        name: "酒馆",
        type: "social",
        position: { x: 200, y: 150 },
        size: { width: 60, height: 50 },
        description: "镇上的社交中心",
      },
      {
        id: "market",
        name: "集市",
        type: "commercial",
        position: { x: 500, y: 200 },
        size: { width: 80, height: 60 },
        description: "买卖商品的地方",
      },
      {
        id: "church",
        name: "教堂",
        type: "religious",
        position: { x: 350, y: 400 },
        size: { width: 50, height: 70 },
        description: "祈祷和礼拜的场所",
      },
      {
        id: "blacksmith",
        name: "铁匠铺",
        type: "crafting",
        position: { x: 600, y: 400 },
        size: { width: 50, height: 40 },
        description: "锻造工具和武器",
      },
    ];

    for (const building of defaultBuildings) {
      world.addBuilding(building);
    }

    // Generate some initial agents
    const sampleIdentities: AgentIdentity[] = [
      {
        name: "爱丽丝",
        age: 28,
        gender: "女",
        occupation: "酒馆老板娘",
        personality: {
          traits: ["热情", "健谈", "务实"],
          values: ["家庭", "社区", "诚实"],
          quirks: ["喜欢收集各地新闻"],
        },
        backstory: "继承了父亲的酒馆，是镇上的消息灵通人士。",
        appearance: {
          description: "红发，微胖，总是面带微笑",
          hairColor: "红色",
          skinTone: "白皙",
          distinguishingFeatures: ["左脸颊有一颗小痣"],
        },
        initialGoals: ["经营好酒馆", "撮合几对年轻人"],
      },
      {
        name: "托马斯",
        age: 35,
        gender: "男",
        occupation: "铁匠",
        personality: {
          traits: ["沉默寡言", "勤劳", "固执"],
          values: ["工艺", "信誉", "独立"],
          quirks: ["工作时喜欢哼歌"],
        },
        backstory: "从小学习铁匠手艺，是镇上唯一的铁匠。",
        appearance: {
          description: "壮实，肌肉发达，满手老茧",
          hairColor: "黑色",
          skinTone: "黝黑",
          distinguishingFeatures: ["右臂有一道伤疤"],
        },
        initialGoals: ["打造一把名剑", "找个徒弟"],
      },
      {
        name: "玛丽",
        age: 22,
        gender: "女",
        occupation: "织布工",
        personality: {
          traits: ["温柔", "细心", "有点害羞"],
          values: ["美", "和谐", "学习"],
          quirks: ["看到花会停下来欣赏"],
        },
        backstory: "母亲教她织布，她希望有一天能设计出独特的花纹。",
        appearance: {
          description: "长发，常穿自己织的围巾",
          hairColor: "棕色",
          skinTone: "白皙",
          distinguishingFeatures: ["手指灵巧修长"],
        },
        initialGoals: ["学习新织法", "开个自己的店"],
      },
    ];

    for (let i = 0; i < sampleIdentities.length; i++) {
      world.addAgent(`agent-${i}`, sampleIdentities[i]);
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
