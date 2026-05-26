import { z } from "zod";
import { AgentIdentity, AgentState, Position, Memory, Action } from "@/lib/types";
import { EraPack } from "@/lib/era-pack/loader";
import { getLLMClient } from "@/lib/llm/client";

// Perception: What an agent observes
export interface Perception {
  timestamp: number;
  location: Position;
  nearbyAgents: Array<{
    agentId: string;
    name: string;
    distance: number;
    activity: string;
  }>;
  nearbyBuildings: Array<{
    buildingId: string;
    name: string;
    type: string;
    distance: number;
  }>;
  currentTime: string;
  weather?: string;
}

// Plan: Agent's current plan
export interface Plan {
  goal: string;
  steps: string[];
  currentStep: number;
  deadline?: number; // Tick deadline
}

// Agent instance
export class Agent {
  id: string;
  identity: AgentIdentity;
  state: AgentState;
  plan: Plan | null = null;
  memories: Memory[] = [];
  eraPack: EraPack | null = null;

  constructor(
    id: string,
    identity: AgentIdentity,
    initialPosition: Position,
    eraPack: EraPack | null = null
  ) {
    this.id = id;
    this.identity = identity;
    this.eraPack = eraPack;
    this.state = {
      position: initialPosition,
      status: "idle",
      currentActivity: "idle",
      energy: 70,
      mood: 50,
      stress: 30,
    };
  }

  // Perception phase: Observe the environment
  perceive(worldState: {
    agents: Map<string, AgentState>;
    buildings: Array<{ id: string; name: string; type: string; position: Position }>;
    currentTime: string;
    tick: number;
  }): Perception {
    const nearbyAgents: Perception["nearbyAgents"] = [];
    const nearbyBuildings: Perception["nearbyBuildings"] = [];

    // Find nearby agents (within 50 units)
    for (const [agentId, agentState] of worldState.agents) {
      if (agentId === this.id) continue;
      const distance = this.calculateDistance(this.state.position, agentState.position);
      if (distance <= 50) {
        nearbyAgents.push({
          agentId,
          name: "Unknown", // Will be filled by caller
          distance,
          activity: agentState.currentActivity,
        });
      }
    }

    // Find nearby buildings
    for (const building of worldState.buildings) {
      const distance = this.calculateDistance(this.state.position, building.position);
      if (distance <= 30) {
        nearbyBuildings.push({
          buildingId: building.id,
          name: building.name,
          type: building.type,
          distance,
        });
      }
    }

    return {
      timestamp: worldState.tick,
      location: this.state.position,
      nearbyAgents,
      nearbyBuildings,
      currentTime: worldState.currentTime,
    };
  }

  // Planning phase: Decide what to do
  async planAction(perception: Perception): Promise<Action> {
    const llm = getLLMClient();

    // Build era-aware system prompt
    let systemPrompt = "";

    if (this.eraPack) {
      systemPrompt = `${this.eraPack.worldPrompt}

【对话风格约束】
${this.eraPack.dialogueStyle}

【绝对禁止提及】
${this.eraPack.forbiddenConcepts.join("、")}

`;
    }

    systemPrompt += `你是 ${this.identity.name}，${this.identity.age} 岁的${this.identity.occupation}。
性格：${this.identity.personality.traits.join("、")}
价值观：${this.identity.personality.values.join("、")}
背景：${this.identity.backstory ?? ""}

[当前状态] energy: ${this.state.energy}, mood: ${this.state.mood}, stress: ${this.state.stress}

Respond with a valid JSON object with these fields:
- action: "move" | "interact" | "talk" | "rest" | "work"
- targetId: string (optional, target agent/building ID)
- description: string (what you're doing)
- reason: string (why you're doing this)`;

    const prompt = `Current time: ${perception.currentTime}
Location: (${perception.location.x.toFixed(1)}, ${perception.location.y.toFixed(1)})
Nearby agents: ${perception.nearbyAgents.map((a) => a.name).join(", ") || "None"}
Nearby buildings: ${perception.nearbyBuildings.map((b) => b.name).join(", ") || "None"}

What do you want to do next?`;

    try {
      const response = await llm.generateObject(
        prompt,
        z.object({
          action: z.enum(["move", "interact", "talk", "rest", "work"]),
          targetId: z.string().optional(),
          description: z.string(),
          reason: z.string(),
        }),
        systemPrompt
      );

      return {
        type: response.action,
        targetId: response.targetId,
        description: response.description,
      };
    } catch (error) {
      // Fallback to random move if LLM fails
      return {
        type: "move",
        description: "Wandering around",
      };
    }
  }

  // Execute phase: Perform the action
  execute(
    action: Action,
    world: {
      width: number;
      height: number;
      getPosition: (id: string) => Position | undefined;
    }
  ): void {
    switch (action.type) {
      case "move": {
        // Move randomly
        const dx = (Math.random() - 0.5) * 20;
        const dy = (Math.random() - 0.5) * 20;
        this.state.position.x = Math.max(
          10,
          Math.min(world.width - 10, this.state.position.x + dx)
        );
        this.state.position.y = Math.max(
          10,
          Math.min(world.height - 10, this.state.position.y + dy)
        );
        this.state.currentActivity = "moving";
        this.state.energy = Math.max(0, this.state.energy - 1);
        break;
      }
      case "rest": {
        this.state.currentActivity = "resting";
        this.state.energy = Math.min(100, this.state.energy + 5);
        this.state.stress = Math.max(0, this.state.stress - 2);
        break;
      }
      case "work": {
        this.state.currentActivity = "working";
        this.state.energy = Math.max(0, this.state.energy - 2);
        break;
      }
      case "talk": {
        this.state.currentActivity = "talking";
        break;
      }
      default: {
        this.state.currentActivity = "idle";
      }
    }
  }

  private calculateDistance(a: Position, b: Position): number {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }
}
