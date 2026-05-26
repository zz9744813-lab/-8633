import { NextRequest, NextResponse } from "next/server";
import { rumorRepo } from "@/db/rumor-repository";

// GET /api/rumors?worldId=xxx&agentId=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const worldId = searchParams.get("worldId");
    const agentId = searchParams.get("agentId");
    const hot = searchParams.get("hot") === "true";

    if (!worldId) {
      return NextResponse.json(
        { error: "worldId is required" },
        { status: 400 }
      );
    }

    if (agentId) {
      // Get rumors known by specific agent
      const rumors = await rumorRepo.getKnownByAgent(agentId, worldId);
      return NextResponse.json({ rumors });
    }

    if (hot) {
      // Get hot rumors (widely spread)
      const rumors = await rumorRepo.getHotRumors(worldId, 3);
      return NextResponse.json({ rumors });
    }

    // Get all rumors
    const rumors = await rumorRepo.getWorldRumors(worldId, 50);
    return NextResponse.json({ rumors });
  } catch (error) {
    console.error("Failed to fetch rumors:", error);
    return NextResponse.json(
      { error: "Failed to fetch rumors" },
      { status: 500 }
    );
  }
}
