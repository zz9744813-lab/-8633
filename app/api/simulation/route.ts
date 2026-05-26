import { NextRequest, NextResponse } from "next/server";
import { getWorld } from "@/lib/agent";
import { initLLM } from "@/lib/llm/client";

export const dynamic = "force-dynamic";

// POST /api/simulation/control - Control simulation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, speed, apiConfig } = body;

    // Initialize LLM if config provided
    if (apiConfig) {
      initLLM({
        provider: apiConfig.provider,
        apiKey: apiConfig.apiKey,
        model: apiConfig.model,
        baseUrl: apiConfig.baseUrl,
      });
    }

    const world = getWorld();
    if (!world) {
      return NextResponse.json({ error: "No active world" }, { status: 404 });
    }

    switch (action) {
      case "start":
        world.start();
        break;
      case "stop":
        world.stop();
        break;
      case "pause":
        world.paused = true;
        break;
      case "resume":
        world.paused = false;
        break;
      case "setSpeed":
        if (typeof speed === "number") {
          world.setSpeed(speed);
        }
        break;
      case "tick":
        await (world as any).step();
        break;
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ world: world.toJSON() });
  } catch (error) {
    console.error("Simulation control error:", error);
    return NextResponse.json(
      { error: "Failed to control simulation" },
      { status: 500 }
    );
  }
}
