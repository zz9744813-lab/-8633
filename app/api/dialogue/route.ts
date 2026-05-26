import { NextRequest, NextResponse } from "next/server";
import { getWorld } from "@/lib/agent";
import { getLLMClient } from "@/lib/llm/client";
import { z } from "zod";

// Dialogue system
export interface Dialogue {
  id: string;
  speakerId: string;
  speakerName: string;
  message: string;
  timestamp: number;
  tick: number;
  listeners: string[];
  context?: string;
}

// In-memory dialogue storage (per world)
const worldDialogues: Map<string, Dialogue[]> = new Map();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, params } = body;

    const world = getWorld();
    if (!world) {
      return NextResponse.json({ error: "No active world" }, { status: 404 });
    }

    switch (type) {
      case "generate": {
        // Generate dialogue between two agents
        const { speakerId, listenerId, context } = params;
        const speaker = world.agents.get(speakerId);
        const listener = world.agents.get(listenerId);

        if (!speaker || !listener) {
          return NextResponse.json(
            { error: "Speaker or listener not found" },
            { status: 404 }
          );
        }

        // Check if they are close enough to talk
        const distance = Math.sqrt(
          Math.pow(speaker.state.position.x - listener.state.position.x, 2) +
            Math.pow(speaker.state.position.y - listener.state.position.y, 2)
        );

        if (distance > 50) {
          return NextResponse.json(
            { error: "Agents are too far apart to talk" },
            { status: 400 }
          );
        }

        const llm = getLLMClient();

        const systemPrompt = `You are ${speaker.identity.name}, a ${speaker.identity.age}-year-old ${speaker.identity.occupation}.
Personality: ${speaker.identity.personality.traits.join(", ")}

You are talking to ${listener.identity.name}, a ${listener.identity.age}-year-old ${listener.identity.occupation}.
${context ? `Context: ${context}` : ""}

Respond with a brief, natural line of dialogue (1-2 sentences). Stay in character. Use period-appropriate language if applicable.`;

        const { text } = await llm.generateText(
          `What do you say to ${listener.identity.name}?`,
          systemPrompt
        );

        const dialogue: Dialogue = {
          id: `dlg-${Date.now()}`,
          speakerId,
          speakerName: speaker.identity.name,
          message: text.trim(),
          timestamp: Date.now(),
          tick: world.tick,
          listeners: [listenerId],
          context,
        };

        // Store dialogue
        const dialogues = worldDialogues.get(world.id) || [];
        dialogues.push(dialogue);
        worldDialogues.set(world.id, dialogues);

        return NextResponse.json({ dialogue });
      }

      case "broadcast": {
        // Agent broadcasts to nearby agents
        const { agentId, message } = params;
        const agent = world.agents.get(agentId);

        if (!agent) {
          return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        // Find nearby agents (within 100 units)
        const listeners: string[] = [];
        for (const [id, other] of world.agents) {
          if (id === agentId) continue;
          const distance = Math.sqrt(
            Math.pow(agent.state.position.x - other.state.position.x, 2) +
              Math.pow(agent.state.position.y - other.state.position.y, 2)
          );
          if (distance <= 100) {
            listeners.push(id);
          }
        }

        const dialogue: Dialogue = {
          id: `dlg-${Date.now()}`,
          speakerId: agentId,
          speakerName: agent.identity.name,
          message,
          timestamp: Date.now(),
          tick: world.tick,
          listeners,
        };

        const dialogues = worldDialogues.get(world.id) || [];
        dialogues.push(dialogue);
        worldDialogues.set(world.id, dialogues);

        return NextResponse.json({ dialogue, listeners: listeners.length });
      }

      case "shout": {
        // Shout to all agents in the world
        const { agentId, message } = params;
        const agent = world.agents.get(agentId);

        if (!agent) {
          return NextResponse.json({ error: "Agent not found" }, { status: 404 });
        }

        const listeners = Array.from(world.agents.keys()).filter((id) => id !== agentId);

        const dialogue: Dialogue = {
          id: `dlg-${Date.now()}-shout`,
          speakerId: agentId,
          speakerName: agent.identity.name,
          message: `【大喊】${message}`,
          timestamp: Date.now(),
          tick: world.tick,
          listeners,
        };

        const dialogues = worldDialogues.get(world.id) || [];
        dialogues.push(dialogue);
        worldDialogues.set(world.id, dialogues);

        return NextResponse.json({ dialogue, listeners: listeners.length });
      }

      default:
        return NextResponse.json({ error: "Unknown dialogue type" }, { status: 400 });
    }
  } catch (error) {
    console.error("Dialogue error:", error);
    return NextResponse.json(
      { error: "Failed to process dialogue" },
      { status: 500 }
    );
  }
}

// GET /api/dialogue - Get recent dialogues
export async function GET(request: NextRequest) {
  const world = getWorld();
  if (!world) {
    return NextResponse.json({ dialogues: [] });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const agentId = searchParams.get("agentId");

  let dialogues = worldDialogues.get(world.id) || [];

  // Filter by agent if specified
  if (agentId) {
    dialogues = dialogues.filter(
      (d) => d.speakerId === agentId || d.listeners.includes(agentId)
    );
  }

  // Get most recent
  dialogues = dialogues.slice(-limit);

  return NextResponse.json({ dialogues });
}
