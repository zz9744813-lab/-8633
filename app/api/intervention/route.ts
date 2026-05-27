import { NextRequest, NextResponse } from "next/server";
import { getWorld } from "@/lib/agent";
import { loadEraPack, generateAgentIdentity, pickLanguages } from "@/lib/era-pack/loader";
import { memoryManager } from "@/lib/agent/memory";

export const dynamic = "force-dynamic";

// Intervention types
// /spawn - Add a new agent at specific location
// /move - Force an agent to move to a location
// /say - Make an agent say something
// /event - Trigger a world event
// /weather - Change weather
// /time - Change time of day
// /emotion - Set agent's emotional state
// /place - Place a building
// /remove - Remove a building or agent

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { command, params } = body;

    const world = getWorld();
    if (!world) {
      return NextResponse.json({ error: "No active world" }, { status: 404 });
    }

    let result: Record<string, unknown>;

    switch (command) {
      case "spawn": {
        const eraPackId = params.eraPackId || "18th_england";
        const eraPack = await loadEraPack(eraPackId);
        if (!eraPack) {
          return NextResponse.json({ error: "Era pack not found" }, { status: 404 });
        }

        const identity = generateAgentIdentity(eraPack);
        const agentId = `agent-${Date.now()}`;
        const position = params.position || {
          x: Math.random() * world.width,
          y: Math.random() * world.height,
        };

        const agent = world.addAgent(agentId, {
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
          knownLanguages: pickLanguages(eraPack, identity.occupation.id),
        }, position);

        result = {
          success: true,
          agent: {
            id: agentId,
            identity: agent.identity,
            position,
          },
        };
        break;
      }

      case "move": {
        const { agentId, x, y } = params;
        const agent = world.agents.get(agentId);
        if (!agent) {
          return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }
        agent.state.position.x = Math.max(0, Math.min(world.width, x));
        agent.state.position.y = Math.max(0, Math.min(world.height, y));
        result = { success: true, agentId, newPosition: { x, y } };
        break;
      }

      case "say": {
        const { agentId, message } = params;
        const agent = world.agents.get(agentId);
        if (!agent) {
          return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }
        // Record as dialogue memory
        try {
          await memoryManager.addMemory({
            agentId: agent.id,
            type: "dialogue",
            content: `你说道: "${message}"`,
            importance: 0.6,
            tick: world.tickCount,
          });
        } catch { /* memory is optional */ }

        result = {
          success: true,
          agentId,
          dialogue: {
            speaker: agent.identity.name,
            message,
            timestamp: Date.now(),
          },
        };
        break;
      }

      case "event": {
        const { description, severity = "normal" } = params;
        result = {
          success: true,
          event: {
            type: "intervention",
            description,
            severity,
            timestamp: Date.now(),
          },
        };
        break;
      }

      case "emotion": {
        const { agentId, mood, stress } = params;
        const agent = world.agents.get(agentId);
        if (!agent) {
          return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }
        if (mood !== undefined) agent.state.mood = Math.max(0, Math.min(100, mood));
        if (stress !== undefined) agent.state.stress = Math.max(0, Math.min(100, stress));
        result = {
          success: true,
          agentId,
          newState: {
            mood: agent.state.mood,
            stress: agent.state.stress,
          },
        };
        break;
      }

      case "speed": {
        const { speed } = params;
        world.setSpeed(speed);
        result = { success: true, newSpeed: speed };
        break;
      }

      case "pause": {
        world.paused = true;
        result = { success: true, paused: true };
        break;
      }

      case "resume": {
        world.paused = false;
        result = { success: true, paused: false };
        break;
      }

      case "place": {
        const { type, name, x, y, width = 60, height = 60 } = params;
        const buildingId = `bld-${Date.now()}`;
        world.addBuilding({
          id: buildingId,
          type,
          name: name || `${type}`,
          position: { x: Math.max(0, Math.min(world.width, x)), y: Math.max(0, Math.min(world.height, y)) },
          width,
          height,
          description: `玩家放置的${name || type}`,
        });
        result = { success: true, buildingId, position: { x, y } };
        break;
      }

      case "remove": {
        const { targetType, targetId } = params;
        if (targetType === "building") {
          const idx = world.buildings.findIndex(b => b.id === targetId);
          if (idx === -1) {
            return NextResponse.json({ error: "Building not found" }, { status: 404 });
          }
          world.buildings.splice(idx, 1);
          result = { success: true, removedType: "building", id: targetId };
        } else if (targetType === "agent") {
          const agent = world.agents.get(targetId);
          if (!agent) {
            return NextResponse.json({ error: "Agent not found" }, { status: 404 });
          }
          agent.state.status = "dead";
          agent.state.deathTick = world.tickCount;
          result = { success: true, removedType: "agent", id: targetId };
        } else {
          return NextResponse.json({ error: "Invalid targetType: building or agent" }, { status: 400 });
        }
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown command: ${command}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Intervention error:", error);
    return NextResponse.json(
      { error: "Failed to execute intervention" },
      { status: 500 }
    );
  }
}

// GET /api/intervention - List available commands
export async function GET() {
  const commands = [
    {
      name: "spawn",
      description: "Create a new agent",
      params: {
        eraPackId: "string (optional)",
        position: "{ x: number, y: number } (optional)",
      },
    },
    {
      name: "move",
      description: "Force an agent to move",
      params: {
        agentId: "string (required)",
        x: "number (required)",
        y: "number (required)",
      },
    },
    {
      name: "say",
      description: "Make an agent speak (recorded as memory)",
      params: {
        agentId: "string (required)",
        message: "string (required)",
      },
    },
    {
      name: "place",
      description: "Place a new building",
      params: {
        type: "string (required, e.g. market, tavern)",
        name: "string (optional)",
        x: "number (required)",
        y: "number (required)",
        width: "number (optional, default 60)",
        height: "number (optional, default 60)",
      },
    },
    {
      name: "remove",
      description: "Remove a building or kill an agent",
      params: {
        targetType: '"building" | "agent" (required)',
        targetId: "string (required)",
      },
    },
    {
      name: "event",
      description: "Trigger a world event",
      params: {
        description: "string (required)",
        severity: '"normal" | "major" | "critical" (optional)',
      },
    },
    {
      name: "emotion",
      description: "Modify agent's emotional state",
      params: {
        agentId: "string (required)",
        mood: "number 0-100 (optional)",
        stress: "number 0-100 (optional)",
      },
    },
    {
      name: "speed",
      description: "Set simulation speed",
      params: {
        speed: "number (required)",
      },
    },
    {
      name: "pause",
      description: "Pause the simulation",
      params: {},
    },
    {
      name: "resume",
      description: "Resume the simulation",
      params: {},
    },
  ];

  return NextResponse.json({ commands });
}
