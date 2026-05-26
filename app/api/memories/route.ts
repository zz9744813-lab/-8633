import { NextRequest, NextResponse } from "next/server";
import { memoryManager, reflectionEngine } from "@/lib/agent/memory";

// GET /api/memories?agentId=xxx&layer=stm|ltm|reflection
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const agentId = searchParams.get("agentId");
    const layer = searchParams.get("layer") || "all";
    const currentTick = parseInt(searchParams.get("tick") || "0", 10);

    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    let data: Record<string, unknown> = {};

    switch (layer) {
      case "stm": {
        const stm = await memoryManager.getSTM(agentId, currentTick, 20);
        data = { layer: "stm", memories: stm };
        break;
      }
      case "ltm": {
        const ltm = await memoryManager.getLTM(agentId, currentTick, 30);
        data = { layer: "ltm", memories: ltm };
        break;
      }
      case "reflection": {
        const reflections = await reflectionEngine.getReflections(agentId, 10);
        data = { layer: "reflection", memories: reflections };
        break;
      }
      case "all":
      default: {
        const [stm, ltm, reflections, totalCount] = await Promise.all([
          memoryManager.getSTM(agentId, currentTick, 10),
          memoryManager.getLTM(agentId, currentTick, 10),
          reflectionEngine.getReflections(agentId, 5),
          memoryManager.getMemoryCount(agentId),
        ]);
        data = {
          layer: "all",
          stm: stm.slice(0, 10),
          ltm: ltm.slice(0, 10),
          reflections: reflections.slice(0, 5),
          totalCount,
        };
        break;
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Memory API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch memories" },
      { status: 500 }
    );
  }
}

// POST /api/memories - Add a new memory
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, type, content, importance, tick, relatedAgentIds } = body;

    if (!agentId || !content || typeof tick !== "number") {
      return NextResponse.json(
        { error: "Missing required fields: agentId, content, tick" },
        { status: 400 }
      );
    }

    const memory = await memoryManager.addMemory({
      agentId,
      type: type || "observation",
      content,
      importance: importance || 0.5,
      tick,
      relatedAgentIds,
    });

    return NextResponse.json({ memory });
  } catch (error) {
    console.error("Add memory error:", error);
    return NextResponse.json(
      { error: "Failed to add memory" },
      { status: 500 }
    );
  }
}

// DELETE /api/memories?agentId=xxx - Clear agent memories
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const agentId = searchParams.get("agentId");

    if (!agentId) {
      return NextResponse.json(
        { error: "agentId is required" },
        { status: 400 }
      );
    }

    await memoryManager.clearMemories(agentId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clear memories error:", error);
    return NextResponse.json(
      { error: "Failed to clear memories" },
      { status: 500 }
    );
  }
}
