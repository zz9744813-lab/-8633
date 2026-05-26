import { Agent } from "./agent";
import { memoryManager } from "./memory";
import { AgentIdentity, Building, Position } from "@/lib/types";
import { EraPack } from "@/lib/era-pack/loader";

// World simulation
export class World {
  id: string;
  name: string;
  width: number;
  height: number;
  tickCount: number = 0;
  paused: boolean = false;
  speed: number = 1;
  eraPack: EraPack | null = null;

  agents: Map<string, Agent> = new Map();
  buildings: Building[] = [];

  private tickInterval: NodeJS.Timeout | null = null;
  private onTickCallbacks: Array<(world: World) => void> = [];

  constructor(
    id: string,
    name: string,
    width: number = 800,
    height: number = 600,
    eraPack: EraPack | null = null
  ) {
    this.id = id;
    this.name = name;
    this.width = width;
    this.height = height;
    this.eraPack = eraPack;
  }

  addAgent(id: string, identity: AgentIdentity, position?: Position): Agent {
    const pos = position || {
      x: Math.random() * (this.width - 20) + 10,
      y: Math.random() * (this.height - 20) + 10,
    };
    const agent = new Agent(id, identity, pos, this.eraPack);
    this.agents.set(id, agent);
    return agent;
  }

  addBuilding(building: Building): void {
    this.buildings.push(building);
  }

  // Get world state for agent perception
  getWorldState() {
    const agentStates = new Map<string, { position: Position; currentActivity: string }>();
    for (const [id, agent] of this.agents) {
      agentStates.set(id, {
        position: agent.state.position,
        currentActivity: agent.state.currentActivity,
      });
    }

    return {
      agents: agentStates,
      buildings: this.buildings.map((b) => ({
        id: b.id,
        name: b.name,
        type: b.type,
        position: b.position,
      })),
      currentTime: this.formatGameTime(),
      tick: this.tickCount,
    };
  }

  // Main simulation step
  async step(): Promise<void> {
    if (this.paused) return;

    const worldState = this.getWorldState();

    // Each agent perceives, plans, and executes
    for (const agent of this.agents.values()) {
      const perception = agent.perceive(worldState);

      // Write observation memories for nearby agents
      for (const nearby of perception.nearbyAgents) {
        await memoryManager.addMemory({
          agentId: agent.id,
          type: "observation",
          content: `看见 ${nearby.name} 在 ${nearby.activity}`,
          importance: 0.3,
          tick: this.tickCount,
          relatedAgentIds: [nearby.agentId],
        });
      }

      const action = await agent.planAction(perception);
      agent.execute(action, {
        width: this.width,
        height: this.height,
        getPosition: (id: string) => {
          const a = this.agents.get(id);
          return a?.state.position;
        },
      });

      // Write action memory
      await memoryManager.addMemory({
        agentId: agent.id,
        type: "event",
        content: action.description,
        importance: 0.4,
        tick: this.tickCount,
      });
    }

    this.tickCount++;

    // Notify listeners
    for (const callback of this.onTickCallbacks) {
      callback(this);
    }
  }

  start(): void {
    if (this.tickInterval) return;

    const intervalMs = 1000 / this.speed;
    this.tickInterval = setInterval(() => {
      this.step();
    }, intervalMs);
  }

  stop(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    if (this.tickInterval) {
      this.stop();
      this.start();
    }
  }

  onTick(callback: (world: World) => void): void {
    this.onTickCallbacks.push(callback);
  }

  private formatGameTime(): string {
    const minutesPerTick = 10;
    const totalMinutes = this.tickCount * minutesPerTick;
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  }

  // Serialization for SSE
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      tick: this.tickCount,
      speed: this.speed,
      paused: this.paused,
      agents: Array.from(this.agents.entries()).map(([id, agent]) => ({
        id,
        identity: agent.identity,
        state: agent.state,
      })),
      buildings: this.buildings,
    };
  }
}
