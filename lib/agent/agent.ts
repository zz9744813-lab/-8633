import { z } from "zod";
import { AgentIdentity, AgentState, Position, Memory, Action } from "@/lib/types";
import { EraPack } from "@/lib/era-pack/loader";
import { getLLMClient } from "@/lib/llm/client";
import { memoryManager } from "@/lib/agent/memory";
import { dialogueSystem } from "@/lib/agent/dialogue";
import { relationshipManager } from "@/db/relationship-repository";

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

// Plan Step for daily planning
export interface PlanStep {
  time: string; // "HH:MM"
  action: "MOVE_TO" | "ENTER" | "WORK" | "EAT" | "SLEEP" | "INTERACT" | "USE" | "WAIT" | "SAY";
  target?: string; // building id / agent id / location key
  description: string;
  reason: string;
}

// Daily Plan
export interface DailyPlan {
  morningThought: string;
  steps: PlanStep[];
  currentStepIdx: number;
  plannedAtTick: number;
}

// Agent instance
export class Agent {
  id: string;
  identity: AgentIdentity;
  state: AgentState;
  memories: Memory[] = [];
  eraPack: EraPack | null = null;

  // Daily planning
  dailyPlan: DailyPlan | null = null;
  lastPlanTick: number = 0;
  lastReflectionTick?: number;

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
      id,
      name: identity.name,
      position: initialPosition,
      status: "alive",
      currentActivity: "idle",
      energy: 70,
      mood: 50,
      stress: 30,
      health: 1.0,
      currentGoals: identity.initialGoals ?? [],
    };
  }

  // Check if agent needs a new daily plan
  needsPlan(currentTick: number, currentHour: number): boolean {
    // If no plan exists, need one
    if (!this.dailyPlan) return true;

    // If plan was made on a different day (assume 144 ticks = 1 day)
    const dayLength = 144;
    const currentDay = Math.floor(currentTick / dayLength);
    const planDay = Math.floor(this.dailyPlan.plannedAtTick / dayLength);

    if (currentDay !== planDay) return true;

    // If it's morning (6:00) and we haven't planned today
    if (currentHour >= 6 && this.dailyPlan.plannedAtTick < currentTick - 10) {
      return true;
    }

    return false;
  }

  // Generate daily plan using LLM
  async generateDailyPlan(currentTick: number, worldState: {
    buildings: Array<{ id: string; name: string; type: string; position: Position }>;
    currentTime: string;
  }): Promise<DailyPlan> {
    const llm = getLLMClient();

    // Retrieve relevant memories for planning context
    const relevantMemories = await memoryManager.retrieveRelevant(
      this.id,
      "今天的计划和目标",
      5
    );

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

[当前状态] energy: ${this.state.energy}, mood: ${this.state.mood}, stress: ${this.state.stress}, health: ${(this.state.health * 100).toFixed(0)}%, status: ${this.state.status}${this.state.illness ? `, 患病: ${this.state.illness.name}` : ""}

[长期目标]
${this.state.currentGoals.length > 0
  ? this.state.currentGoals.map((g, i) => `${i + 1}. ${g}`).join("\n")
  : "暂无明确长期目标"}

今天的计划应该考虑这些目标——不一定每天都推进，但不要完全无视。

[相关记忆]
${relevantMemories.length > 0
  ? relevantMemories.map(m => `- ${m.content}`).join("\n")
  : "暂无相关记忆"}

请为今天制定一个日程计划。从早上6点到晚上10点，安排5-10个活动步骤。
每个步骤包括：时间、行动类型、目标（可选）、描述、原因。

可用建筑：${worldState.buildings.map((b) => `${b.name}(${b.id})`).join("、")}

请返回 JSON 格式：`;

    const PlanSchema = z.object({
      morningThought: z.string(),
      steps: z.array(z.object({
        time: z.string(), // "HH:MM"
        action: z.enum(["MOVE_TO", "ENTER", "WORK", "EAT", "SLEEP", "INTERACT", "USE", "WAIT", "SAY"]),
        target: z.string().optional(),
        description: z.string(),
        reason: z.string(),
      })).min(5).max(10),
    });

    try {
      const response = await llm.generateObject(
        `当前时间：${worldState.currentTime}\n请制定今天的日程计划。`,
        PlanSchema,
        systemPrompt
      );

      this.dailyPlan = {
        morningThought: response.morningThought,
        steps: response.steps,
        currentStepIdx: 0,
        plannedAtTick: currentTick,
      };

      this.lastPlanTick = currentTick;

      return this.dailyPlan;
    } catch (error) {
      console.error("Failed to generate daily plan:", error);

      // Fallback to basic plan
      this.dailyPlan = {
        morningThought: "今天又是普通的一天。",
        steps: [
          { time: "06:00", action: "WORK", description: "开始工作", reason: "维持生计" },
          { time: "12:00", action: "EAT", description: "吃午饭", reason: "补充能量" },
          { time: "18:00", action: "WORK", description: "继续工作", reason: "完成任务" },
          { time: "22:00", action: "SLEEP", description: "睡觉休息", reason: "恢复精力" },
        ],
        currentStepIdx: 0,
        plannedAtTick: currentTick,
      };

      return this.dailyPlan;
    }
  }

  // Get current action from plan based on time
  getCurrentActionFromPlan(currentHour: number, currentMinute: number): Action {
    if (!this.dailyPlan || this.dailyPlan.steps.length === 0) {
      return { type: "WAIT", description: "四处闲逛", reason: "无计划" };
    }

    const currentTime = currentHour * 60 + currentMinute;

    // Find the current step based on time
    let currentStep = this.dailyPlan.steps[0];
    for (let i = 0; i < this.dailyPlan.steps.length; i++) {
      const step = this.dailyPlan.steps[i];
      const [stepHour, stepMin] = step.time.split(":").map(Number);
      const stepTime = stepHour * 60 + stepMin;

      if (stepTime <= currentTime) {
        currentStep = step;
        this.dailyPlan.currentStepIdx = i;
      } else {
        break;
      }
    }

    // Return action with original plan type (no mapping)
    return {
      type: currentStep.action,
      targetId: currentStep.target,
      description: currentStep.description,
      reason: currentStep.reason,
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
          name: "Unknown",
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

  // Planning phase: Decide what to do with memory retrieval
  async planAction(perception: Perception): Promise<Action> {
    const llm = getLLMClient();

    // Retrieve relevant memories based on current context
    const contextQuery = `What should I do at ${perception.currentTime} near ${perception.nearbyBuildings.map(b => b.name).join(", ") || "nowhere"}?`;
    const relevantMemories = await memoryManager.retrieveRelevant(this.id, contextQuery, 5);

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

[当前状态] energy: ${this.state.energy}, mood: ${this.state.mood}, stress: ${this.state.stress}, health: ${(this.state.health * 100).toFixed(0)}%, status: ${this.state.status}${this.state.illness ? `, 患病: ${this.state.illness.name}` : ""}

[相关记忆]
${relevantMemories.length > 0
  ? relevantMemories.map(m => `- ${m.content}`).join("\n")
  : "暂无相关记忆"}

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
      buildings: Array<{ id: string; name: string; type: string; position: Position; width: number; height: number }>;
    },
    dt: number = 1
  ): boolean {
    // Dead agents do nothing
    if (this.state.status === "dead") return true;

    switch (action.type) {
      case "MOVE_TO": {
        if (!action.targetId) {
          this.state.currentActivity = "idle";
          return true;
        }

        // Find target building
        const building = world.buildings.find((b) => b.id === action.targetId);
        if (!building) {
          this.state.currentActivity = "idle";
          return true;
        }

        // Set target position to building center
        const targetPos: Position = {
          x: building.position.x + building.width / 2,
          y: building.position.y + building.height / 2,
        };

        // Move towards target
        const arrived = moveTowards(this, targetPos, dt);
        if (arrived) {
          this.state.targetPosition = null;
          this.state.currentActivity = "idle";
          return true;
        } else {
          this.state.targetPosition = targetPos;
          this.state.currentActivity = "moving_to_" + building.name;
          return false;
        }
      }
      case "ENTER": {
        if (action.targetId) {
          this.state.insideBuildingId = action.targetId;
          const building = world.buildings.find((b) => b.id === action.targetId);
          this.state.currentActivity = "inside_" + (building?.name || "building");
        }
        return true;
      }
      case "WORK": {
        this.state.currentActivity = "working";
        this.state.energy = Math.max(0, this.state.energy - 2);
        return true;
      }
      case "EAT": {
        this.state.currentActivity = "eating";
        this.state.energy = Math.min(100, this.state.energy + 10);
        return true;
      }
      case "SLEEP": {
        this.state.currentActivity = "sleeping";
        this.state.energy = Math.min(100, this.state.energy + 15);
        this.state.stress = Math.max(0, this.state.stress - 5);
        return true;
      }
      case "INTERACT": {
        this.state.currentActivity = "interacting";
        return true;
      }
      case "USE": {
        this.state.currentActivity = "using";
        return true;
      }
      case "WAIT": {
        this.state.currentActivity = "waiting";
        return true;
      }
      case "SAY": {
        this.state.currentActivity = "talking";
        return true;
      }
      default: {
        this.state.currentActivity = "idle";
        return true;
      }
    }
  }

  private calculateDistance(a: Position, b: Position): number {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
  }

  // Talk to another agent
  async talkTo(
    targetAgent: Agent,
    world: {
      buildings: Array<{ id: string; name: string; type: string; position: Position }>;
      currentTime: string;
      currentTick: number;
    }
  ): Promise<{ speakerText: string; listenerResponse: string } | null> {
    const building = world.buildings.find((b) => {
      const dist = this.calculateDistance(this.state.position, b.position);
      return dist < 20;
    });

    const result = await dialogueSystem.generateDialogue({
      world,
      speaker: this,
      listener: targetAgent,
      location: building?.name,
      timeOfDay: world.currentTime,
      currentTick: world.currentTick,
      eraPack: this.eraPack,
    });

    return {
      speakerText: result.speakerText,
      listenerResponse: result.listenerResponse,
    };
  }

  // Generate internal monologue
  async think(situation: string, currentTick: number): Promise<string> {
    return await dialogueSystem.generateMonologue(this, situation, currentTick);
  }

  // Get relationship with another agent
  async getRelationshipWith(targetAgentId: string) {
    return await relationshipManager.getRelationship(this.id, targetAgentId);
  }

  // Get all relationships
  async getAllRelationships() {
    return await relationshipManager.getAgentRelationships(this.id);
  }
}

// Move agent towards target position
function moveTowards(agent: Agent, target: Position, dt: number): boolean {
  const dx = target.x - agent.state.position.x;
  const dy = target.y - agent.state.position.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) {
    agent.state.targetPosition = null;
    return true; // arrived
  }
  const speed = 30; // pixels per tick
  const step = Math.min(speed * dt, dist);
  agent.state.position.x += (dx / dist) * step;
  agent.state.position.y += (dy / dist) * step;
  return false;
}
