import { NextRequest, NextResponse } from "next/server";
import { getWorld } from "@/lib/agent";
import { AgentIdentity } from "@/lib/types";

// GET /api/agents - List all agents
export async function GET() {
  const world = getWorld();

  if (!world) {
    return NextResponse.json({ agents: [] });
  }

  const agents = Array.from(world.agents.entries()).map(([id, agent]) => ({
    id,
    identity: agent.identity,
    state: agent.state,
  }));

  return NextResponse.json({ agents });
}

// POST /api/agents - Add a new agent
export async function POST(request: NextRequest) {
  try {
    const world = getWorld();

    if (!world) {
      return NextResponse.json(
        { error: "No active world" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const identity: AgentIdentity = body.identity;

    if (!identity || !identity.name) {
      return NextResponse.json(
        { error: "Agent identity is required" },
        { status: 400 }
      );
    }

    const agentId = `agent-${Date.now()}`;
    const agent = world.addAgent(agentId, identity, body.position);

    return NextResponse.json({
      agent: {
        id: agentId,
        identity: agent.identity,
        state: agent.state,
      },
    });
  } catch (error) {
    console.error("Failed to add agent:", error);
    return NextResponse.json(
      { error: "Failed to add agent" },
      { status: 500 }
    );
  }
}
