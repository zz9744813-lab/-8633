import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/index";
import { agents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getWorld } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { agentId, portraitUrl } = await request.json();
    if (!agentId || !portraitUrl) {
      return NextResponse.json({ error: "agentId and portraitUrl are required" }, { status: 400 });
    }

    // Persist to DB
    await db.update(agents).set({ portraitUrl }).where(eq(agents.id, agentId));

    // Update in-memory agent so SSE pushes the url immediately
    const world = getWorld();
    if (world) {
      const agent = world.agents.get(agentId);
      if (agent) {
        agent.identity.portraitUrl = portraitUrl;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save portrait:", error);
    return NextResponse.json({ error: "Failed to save portrait" }, { status: 500 });
  }
}
