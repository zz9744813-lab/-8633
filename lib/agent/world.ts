import { Agent } from "./agent";
import { memoryManager, reflectionEngine } from "./memory";
import { chronicleEngine } from "./chronicle-engine";
import { rumorEngine } from "./rumor-engine";
import { dramaEngine } from "./drama-engine";
import { AgentIdentity, Building, Position } from "@/lib/types";
import { EraPack } from "@/lib/era-pack/loader";
import { worldEventSystem } from "@/db/world-event-repository";
import { worldRepository } from "@/db/world-repository";

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
  private running: boolean = false;
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

  addAgent(
    id: string,
    identity: AgentIdentity,
    position?: Position,
    recordBirth: boolean = true
  ): Agent {
    const pos = position || {
      x: Math.random() * (this.width - 20) + 10,
      y: Math.random() * (this.height - 20) + 10,
    };
    const agent = new Agent(id, identity, pos, this.eraPack);
    this.agents.set(id, agent);

    // F1: Record birth in chronicle
    if (recordBirth) {
      chronicleEngine.recordBirth(this, agent).catch((e) => {
        console.error("[World] Failed to record birth:", e);
      });
    }

    return agent;
  }

  addBuilding(building: Building): void {
    this.buildings.push(building);
  }

  // Get current game time from tick
  getGameTime(): { hour: number; minute: number } {
    const minutesPerTick = 10;
    const totalMinutes = this.tickCount * minutesPerTick;
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    return { hour, minute };
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
    const { hour, minute } = this.getGameTime();

    // Each agent perceives, plans (if needed), and executes
    for (const agent of this.agents.values()) {
      // Check if agent needs a new daily plan
      if (agent.needsPlan(this.tickCount, hour)) {
        // Stagger planning to avoid simultaneous LLM calls
        // Use agent.id hash to determine offset
        const agentHash = agent.id.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
        const staggerOffset = agentHash % 30; // 0-30 minutes stagger
        const currentMinutes = hour * 60 + minute;

        // Only plan if we've passed the stagger offset
        if (currentMinutes % 30 >= staggerOffset || !agent.dailyPlan) {
          await agent.generateDailyPlan(this.tickCount, {
            buildings: this.buildings,
            currentTime: worldState.currentTime,
          });
        }
      }

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

      // Get action from daily plan instead of calling LLM every tick
      let action;
      if (agent.dailyPlan && agent.dailyPlan.steps.length > 0) {
        action = agent.getCurrentActionFromPlan(hour, minute);
      } else {
        // Fallback to LLM planning if no daily plan
        action = await agent.planAction(perception);
      }

      // Execute action with buildings context
      const completed = agent.execute(action, {
        width: this.width,
        height: this.height,
        buildings: this.buildings,
      });

      // If action completed and it's a talking action, try dialogue
      if (completed && action.type === "SAY" && action.targetId) {
        const targetAgent = this.agents.get(action.targetId);
        if (targetAgent) {
          try {
            await agent.talkTo(targetAgent, {
              buildings: this.buildings,
              currentTime: worldState.currentTime,
              currentTick: this.tickCount,
            });
          } catch (e) {
            console.error("[World] Dialogue failed:", e);
          }
        }
      }

      // Write action memory
      await memoryManager.addMemory({
        agentId: agent.id,
        type: "event",
        content: action.description,
        importance: 0.4,
        tick: this.tickCount,
      });
    }

    // === W2: Dialogue triggering ===
    const interactedPairs = new Set<string>();
    for (const agent of this.agents.values()) {
      if (agent.state.currentActivity === "talking") continue;
      for (const [otherId, other] of this.agents) {
        if (otherId === agent.id) continue;
        const pairKey = [agent.id, otherId].sort().join("-");
        if (interactedPairs.has(pairKey)) continue;

        const dist = Math.hypot(
          agent.state.position.x - other.state.position.x,
          agent.state.position.y - other.state.position.y
        );
        if (dist > 25) continue;

        // 30 ticks 内说过话就别再触发
        const recentMemories = await memoryManager.getSTM(agent.id, this.tickCount, 10);
        const lastTalk = recentMemories.find(m =>
          m.type === "dialogue" && m.content.includes(other.identity.name)
        );
        if (lastTalk && this.tickCount - lastTalk.tick < 30) continue;

        // 50% 概率搭话
        if (Math.random() > 0.5) continue;

        interactedPairs.add(pairKey);
        try {
          await agent.talkTo(other, {
            buildings: this.buildings,
            currentTime: worldState.currentTime,
            currentTick: this.tickCount,
          });
        } catch (e) {
          console.error("[World] Dialogue failed:", e);
        }
        break; // 一个 agent 一个 tick 最多说一段
      }
    }

    // === W3: Auto reflection (每个 agent 一天一次，22:00 触发) ===
    if (hour === 22 && minute === 0) {
      for (const agent of this.agents.values()) {
        if (this.tickCount - (agent.lastReflectionTick ?? 0) >= 100) {
          try {
            const result = await reflectionEngine.reflect(agent.id, agent.state, this.tickCount);
            if (result) {
              agent.lastReflectionTick = this.tickCount;

              // F2.3: Apply goal updates from reflection
              if (result.goalUpdates) {
                const currentGoals = agent.state.currentGoals || [];

                // Remove goals
                if (result.goalUpdates.remove && result.goalUpdates.remove.length > 0) {
                  for (const goalToRemove of result.goalUpdates.remove) {
                    const idx = currentGoals.indexOf(goalToRemove);
                    if (idx !== -1) {
                      currentGoals.splice(idx, 1);
                      console.log(`[Reflection] ${agent.identity.name} abandoned goal: ${goalToRemove}`);
                    }
                  }
                }

                // Add new goals
                if (result.goalUpdates.add && result.goalUpdates.add.length > 0) {
                  for (const newGoal of result.goalUpdates.add) {
                    if (!currentGoals.includes(newGoal)) {
                      currentGoals.push(newGoal);
                      console.log(`[Reflection] ${agent.identity.name} set new goal: ${newGoal}`);
                    }
                  }
                }

                // Update agent state
                agent.state.currentGoals = currentGoals;
              }
            }
          } catch (e) {
            console.error("[World] Reflection failed:", e);
          }
        }
      }
    }

    // === W4: World events (每 100 ticks 触发一次) ===
    if (this.tickCount % 100 === 0 && this.tickCount > 0) {
      const event = await worldEventSystem.generateRandomEvent(
        this.id,
        this.tickCount,
        Array.from(this.agents.keys()),
        this.eraPack
      );

      // 把目击者写入 memory
      if (event) {
        for (const witnessId of event.witnessIds) {
          await memoryManager.addMemory({
            agentId: witnessId,
            type: "observation",
            content: `目击了世界事件：${event.description}`,
            importance: event.type === "disaster" ? 0.9 : event.type === "festival" ? 0.7 : 0.5,
            tick: this.tickCount,
          });
        }

        // F1: Record important world events in chronicle
        if (event.type === "disaster" || event.type === "festival") {
          await chronicleEngine.recordDisaster(
            this,
            event.type === "disaster" ? "天灾降临" : "节日庆典",
            event.description,
            event.witnessIds
          );
        }
      }
    }

    // === F3: Rumor generation (每天一次，随机生成谣言) ===
    if (hour === 20 && minute === 0) {
      for (const agent of this.agents.values()) {
        // 20% 概率产生谣言
        if (Math.random() < 0.2) {
          try {
            const result = await rumorEngine.generateRumorFromMemory(this, agent);
            if (result) {
              console.log(`[Rumor] ${agent.identity.name} created a ${result.type} rumor about ${result.subject}`);
            }
          } catch (e) {
            console.error("[World] Rumor generation failed:", e);
          }
        }
      }
    }

    // === F4: Drama detection (每天检查一次，20:00 触发) ===
    if (hour === 20 && minute === 30) {
      try {
        const drama = await dramaEngine.checkForDrama(this);
        if (drama) {
          await dramaEngine.executeDrama(this, drama);
          console.log(`[Drama] Triggered: ${drama.type} - ${drama.description}`);
        }
      } catch (e) {
        console.error("[World] Drama check failed:", e);
      }
    }

    // === F1: Daily summary generation (23:50 触发) ===
    if (hour === 23 && minute === 50) {
      const dayNumber = Math.floor(this.tickCount / 144);
      await chronicleEngine.generateDailySummary(this, dayNumber);
    }

    // === W6: Auto save (每 50 ticks) ===
    if (this.tickCount % 50 === 0 && this.tickCount > 0) {
      try {
        await worldRepository.saveWorld(this);
        console.log(`[World] Saved at tick ${this.tickCount}`);
      } catch (e) {
        console.error("[World] Save failed:", e);
      }
    }

    this.tickCount++;

    // Notify listeners
    for (const callback of this.onTickCallbacks) {
      callback(this);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const loop = async () => {
      while (this.running) {
        const start = performance.now();
        try {
          await this.step();
        } catch (e) {
          console.error("[World] Step failed:", e);
        }
        const elapsed = performance.now() - start;
        const wait = Math.max(0, (1000 / this.speed) - elapsed);
        await new Promise(r => setTimeout(r, wait));
      }
    };
    loop();
  }

  stop(): void {
    this.running = false;
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
    const { hour, minute } = this.getGameTime();
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
        dailyPlan: agent.dailyPlan,
      })),
      buildings: this.buildings,
    };
  }
}
