import { Agent } from "./agent";
import { memoryManager, reflectionEngine } from "./memory";
import { chronicleEngine } from "./chronicle-engine";
import { rumorEngine } from "./rumor-engine";
import { dramaEngine } from "./drama-engine";
import { AgentIdentity, Building, Position } from "@/lib/types";
import { EraPack } from "@/lib/era-pack/loader";
import { initBuildingEconomy, calculatePrice, ITEMS } from "@/lib/economy/engine";
import { worldEventSystem } from "@/db/world-event-repository";
import { worldRepository } from "@/db/world-repository";
import { relationshipManager } from "@/db/relationship-repository";
import { isLLMInitialized } from "@/lib/llm/client";

// T5.1: Batch memory queue for performance
interface PendingMemory {
  agentId: string;
  type: string;
  content: string;
  importance: number;
  tick: number;
  relatedAgentIds?: string[];
  locationId?: string;
}

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

  // I3: Weather state
  currentWeather: "clear" | "rain" | "snow" | "fog" | "storm" = "clear";
  weatherIntensity: number = 0;
  weatherEndsAtTick: number = 0;

  // T2.1: Fixed lifecycle
  private tickTimeout: NodeJS.Timeout | null = null;
  private lastTickTime: number = 0;
  private running: boolean = false;
  onTickCallbacks: Array<(world: World) => void> = [];

  // T5.1: Batch memory queue
  private pendingMemories: PendingMemory[] = [];
  private lastMemoryFlushTick: number = 0;

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
        type: b.type as string,
        position: b.position,
      })),
      currentTime: this.formatGameTime(),
      tick: this.tickCount,
    };
  }

  // T5.1: Queue memory for batch insert
  queueMemory(memory: PendingMemory): void {
    this.pendingMemories.push(memory);
  }

  // T5.1: Flush pending memories to DB (call at end of tick)
  private async flushMemories(): Promise<void> {
    if (this.pendingMemories.length === 0) return;

    const memoriesToFlush = this.pendingMemories.splice(0, this.pendingMemories.length);

    try {
      // Batch insert using Promise.all for now (drizzle doesn't support true bulk insert with SQLite)
      // Group by agent to reduce DB round trips
      const byAgent = new Map<string, typeof memoriesToFlush>();
      for (const m of memoriesToFlush) {
        const list = byAgent.get(m.agentId) || [];
        list.push(m);
        byAgent.set(m.agentId, list);
      }

      // Insert per agent in parallel with limited concurrency
      const entries = Array.from(byAgent.entries());
      const batchSize = 5; // Limit concurrent inserts

      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async ([agentId, mems]) => {
            for (const m of mems) {
              try {
                await memoryManager.addMemory(m as any);
              } catch (e) {
                console.warn(`[World] Failed to add memory for ${agentId}:`, e);
              }
            }
          })
        );
      }

      if (memoriesToFlush.length > 10) {
        console.log(`[World] Flushed ${memoriesToFlush.length} memories`);
      }
    } catch (e) {
      console.error("[World] Failed to flush memories:", e);
    }
  }

  // Main simulation step
  async step(): Promise<void> {
    if (this.paused) return;

    const worldState = this.getWorldState();
    const { hour, minute } = this.getGameTime();

    // === I3: Weather expiry ===
    if (this.currentWeather !== "clear" && this.tickCount >= this.weatherEndsAtTick) {
      this.currentWeather = "clear";
      this.weatherIntensity = 0;
    }

    // === H2.4: Daily lexicon popularity update (midnight) ===
    if (hour === 0 && minute === 0 && this.agents.size > 0) {
      try {
        const { lexiconRepo } = await import("@/db/lexicon-repository");
        await lexiconRepo.updatePopularity(this.id, this.agents.size);
      } catch (e) {
        // Lexicon tables may not exist yet
      }
    }

    // === G1.3: Daily health tick (midnight) ===
    if (hour === 0 && minute === 0) {
      for (const agent of this.agents.values()) {
        if (agent.state.status === "dead") continue;

        // Age-related decay
        const ageDecay = (agent.identity.age / 100) * 0.002;
        agent.state.health = Math.max(0, agent.state.health - ageDecay);

        // Illness accelerates decay
        if (agent.state.illness) {
          agent.state.health = Math.max(0, agent.state.health - agent.state.illness.severity * 0.01);

          // Self-heal check
          if (this.tickCount - agent.state.illness.startTick > agent.state.illness.estimatedDuration) {
            agent.state.illness = undefined;
            if (agent.state.status === "sick") {
              agent.state.status = "alive";
            }
          }
        }

        // G4: Daily consumption — deduct dailyNeeds from inventory
        const occ = agent.eraPack?.occupations.find(o => o.name === agent.identity.occupation || o.id === agent.identity.occupation);
        if (occ?.dailyNeeds) {
          agent.state.inventory = agent.state.inventory ?? {};
          for (const [itemId, neededQty] of Object.entries(occ.dailyNeeds)) {
            if (neededQty <= 0) continue;
            const have = agent.state.inventory[itemId] ?? 0;
            if (have >= neededQty) {
              agent.state.inventory[itemId] = have - neededQty;
            } else {
              const shortage = neededQty - have;
              agent.state.inventory[itemId] = 0;
              agent.state.health = Math.max(0, agent.state.health - shortage * 0.02);
            }
          }
        }

        // G2: Age increment (once per year on day 0)
        const daysPassed = Math.floor(this.tickCount / 144);
        const prevDays = Math.floor((this.tickCount - 1) / 144);
        const dayOfYear = daysPassed % 365;
        if (dayOfYear === 0 && daysPassed > 0 && daysPassed !== prevDays) {
          agent.identity.age += 1;
        }

        // Death check
        if (agent.state.health <= 0) {
          agent.state.status = "dead";
          agent.state.deathTick = this.tickCount;
          const cause = agent.state.illness?.name ?? "年老";
          await chronicleEngine.recordDeath(this, agent, cause);

          // Notify close friends (affinity > 0.5)
          try {
            const relations = await agent.getAllRelationships();
            for (const rel of relations) {
              if (rel.affinity > 0.5) {
                this.queueMemory({
                  agentId: rel.toAgentId,
                  type: "event",
                  content: `${agent.identity.name} 去世了。`,
                  importance: 0.9,
                  tick: this.tickCount,
                  relatedAgentIds: [agent.id],
                });
              }
            }
          } catch (e) {
            console.error("[World] Failed to notify death:", e);
          }

          console.log(`[World] ${agent.identity.name} has died at age ${agent.identity.age} (${cause})`);
        }
      }
    }

    // === G2: Marriage/family check at midnight ===
    if (hour === 0 && minute === 0) {
      // Check each pair for relationship upgrade to marriage
      const agentsList = Array.from(this.agents.values()).filter(a => a.state.status === "alive" && a.identity.age >= 16);
      for (let i = 0; i < agentsList.length; i++) {
        const a = agentsList[i];
        if (a.identity.spouseId) continue;
        const relations = await a.getAllRelationships().catch(() => []);
        for (const rel of relations) {
          const b = this.agents.get(rel.toAgentId);
          if (!b || b.identity.spouseId || b.state.status !== "alive" || b.identity.age < 16) continue;
          if (rel.affinity > 0.85 && !rel.label?.includes("lover") && !rel.label?.includes("engaged") && !rel.label?.includes("married")) {
            await relationshipManager.setRelationshipLabel(a.id, b.id, "lover");
            console.log(`[G2] ${a.identity.name} and ${b.identity.name} became lovers`);
          } else if (rel.affinity > 0.9 && rel.label === "lover") {
            await relationshipManager.setRelationshipLabel(a.id, b.id, "engaged");
            console.log(`[G2] ${a.identity.name} and ${b.identity.name} got engaged`);
          } else if (rel.label === "engaged" && Math.random() < 0.1) {
            await relationshipManager.setRelationshipLabel(a.id, b.id, "married");
            a.identity.spouseId = b.id;
            b.identity.spouseId = a.id;
            const familyName = a.identity.familyName || a.identity.name.split(" ").pop() || a.identity.name;
            if (!a.identity.familyName) a.identity.familyName = familyName;
            if (!b.identity.familyName) b.identity.familyName = familyName;
            await chronicleEngine.recordMarriage(this, a, b);
            console.log(`[G2] ${a.identity.name} and ${b.identity.name} got married!`);
          }
        }
      }

      // Trigger pregnancy for married couples
      for (const agent of agentsList) {
        if (!agent.identity.spouseId || agent.state.pregnantSince) continue;
        if (agent.identity.age > 45 || agent.identity.gender !== "female") continue;
        const spouse = this.agents.get(agent.identity.spouseId);
        if (!spouse || spouse.state.status !== "alive" || spouse.identity.age > 45) continue;
        const rel = await agent.getRelationshipWith(spouse.id).catch(() => null);
        if (!rel || rel.affinity < 0.7) continue;
        const lastChildTick = agent.identity.childIds?.length
          ? Math.max(...agent.identity.childIds.map(id => this.agents.get(id)?.state?.deathTick ?? 0))
          : 0;
        if (this.tickCount - lastChildTick < 52560) continue; // ~1 year
        if (Math.random() < 0.05) {
          agent.state.pregnantSince = this.tickCount;
          this.queueMemory({
            agentId: agent.id, type: "observation",
            content: "你怀孕了。", importance: 0.85, tick: this.tickCount,
          });
          console.log(`[G2] ${agent.identity.name} is pregnant!`);
        }
      }

      // Check pregnancies and give birth
      const DAYS_PREGNANCY = 270;
      for (const agent of agentsList) {
        if (!agent.state.pregnantSince) continue;
        const pregnantTicks = this.tickCount - agent.state.pregnantSince;
        if (pregnantTicks >= DAYS_PREGNANCY * 144) {
          // Give birth
          const spouse = agent.identity.spouseId ? this.agents.get(agent.identity.spouseId) : null;
          agent.state.pregnantSince = undefined;
          const childId = `child-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
          const childName = spouse
            ? `${spouse.identity.name.split(" ")[0]} Jr.`
            : `${agent.identity.name.split(" ")[0]}'s Child`;
          const childIdentity: AgentIdentity = {
            name: childName, age: 0, gender: Math.random() > 0.5 ? "male" : "female",
            occupation: "child", backstory: `${agent.identity.name}之子`,
            personality: { traits: ["好奇"], values: [], quirks: [] },
            appearance: { description: "孩童", hairColor: "褐色", skinTone: "白皙", distinguishingFeatures: [] },
            initialGoals: [],
            parentIds: [agent.id, ...(spouse ? [spouse.id] : [])],
            familyName: agent.identity.familyName || agent.identity.name.split(" ").pop(),
          };
          const childAgent = this.addAgent(childId, childIdentity, undefined, true);
          childAgent.state.health = 1.0;
          if (!agent.identity.childIds) agent.identity.childIds = [];
          agent.identity.childIds.push(childId);
          if (spouse) {
            if (!spouse.identity.childIds) spouse.identity.childIds = [];
            spouse.identity.childIds.push(childId);
          }
          console.log(`[G2] ${agent.identity.name} gave birth to ${childName}`);
        }
      }
    }

    // === G4: Economy restock & auto-buy at midnight ===
    if (hour === 0 && minute === 0) {
      for (const building of this.buildings) {
        if (!building.economy) {
          building.economy = initBuildingEconomy(building.type, this.tickCount);
        } else {
          const econ = building.economy;
          // Restock each item to max (double base stock)
          for (const itemId of Object.keys(econ.prices)) {
            const maxStock = ITEMS[itemId] ? 50 : 10;
            const currentStock = econ.inventory[itemId] ?? 0;
            if (currentStock < maxStock) {
              econ.inventory[itemId] = Math.min(maxStock, currentStock + Math.ceil(maxStock * 0.3));
            }
          }
          econ.lastRestockTick = this.tickCount;
        }
      }

      // Auto-buy food when low (<3 items)
      for (const agent of this.agents.values()) {
        if (agent.state.status !== "alive" || agent.identity.age < 12) continue;
        const inv = agent.state.inventory ?? {};
        const totalFood = Object.entries(inv).filter(([id]) => ITEMS[id]?.category === "food").reduce((s, [, q]) => s + q, 0);
        if (totalFood < 3) {
          // Find nearest shop selling food
          for (const building of this.buildings) {
            if (!building.economy) continue;
            for (const [itemId, stock] of Object.entries(building.economy.inventory)) {
              if (stock <= 0) continue;
              const item = ITEMS[itemId];
              if (!item || item.category !== "food") continue;
              const price = calculatePrice(item.basePrice, stock, 50);
              if ((agent.state.money ?? 0) >= price) {
                agent.state.money = (agent.state.money ?? 0) - price;
                agent.state.inventory = { ...agent.state.inventory, [itemId]: (agent.state.inventory?.[itemId] ?? 0) + 1 };
                building.economy.inventory[itemId] = (building.economy.inventory[itemId] ?? 0) - 1;
                break;
              }
            }
            if (Object.values(agent.state.inventory ?? {}).reduce((s, q) => s + q, 0) > (agent.state.inventory?.bread ?? 0)) break;
          }
        }
      }
    }

    // === G1.4: Process illness events from world events ===
    // (illness is applied to witness agents when the event is processed below)

    // Each agent perceives, plans (if needed), and executes
    for (const agent of this.agents.values()) {
      // Skip dead agents
      if (agent.state.status === "dead") continue;
      // Check if agent needs a new daily plan
      if (agent.needsPlan(this.tickCount, hour)) {
        // Stagger planning to avoid simultaneous LLM calls
        // Use agent.id hash to determine offset
        const agentHash = agent.id.split("").reduce((a, b) => a + b.charCodeAt(0), 0);
        const staggerOffset = agentHash % 30; // 0-30 minutes stagger
        const currentMinutes = hour * 60 + minute;

        // Only plan if we've passed the stagger offset
        if (currentMinutes % 30 >= staggerOffset || !agent.dailyPlan) {
          // T6.1: Check if LLM is initialized
          if (isLLMInitialized()) {
            await agent.generateDailyPlan(this.tickCount, {
              buildings: this.buildings,
              currentTime: worldState.currentTime,
              weather: this.currentWeather,
              weatherIntensity: this.weatherIntensity,
            });
          } else {
            // T6.1: Use fallback rule-based plan when LLM not available
            agent.dailyPlan = agent.generateFallbackPlan(this.tickCount, hour, this.buildings);
            console.log(`[World] ${agent.identity.name} using fallback plan (LLM not initialized)`);
          }
        }
      }

      const perception = agent.perceive(worldState);

      // Write observation memories for nearby agents
      for (const nearby of perception.nearbyAgents) {
        this.queueMemory({
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

      // G4: Handle BUY action - find nearest shop and purchase
      if (completed && action.type === "BUY" && agent.state.insideBuildingId) {
        const building = this.buildings.find(b => b.id === agent.state.insideBuildingId);
        if (building?.economy) {
          for (const [itemId, stock] of Object.entries(building.economy.inventory)) {
            if (stock <= 0) continue;
            const item = ITEMS[itemId];
            if (!item) continue;
            const price = calculatePrice(item.basePrice, stock, 50);
            if ((agent.state.money ?? 0) >= price) {
              agent.state.money = (agent.state.money ?? 0) - price;
              agent.state.inventory = { ...agent.state.inventory, [itemId]: (agent.state.inventory?.[itemId] ?? 0) + 1 };
              building.economy.inventory[itemId] = stock - 1;
              agent.state.currentActivity = "buying";
              break;
            }
          }
        }
      }
      // G4: Handle SELL action
      if (completed && action.type === "SELL" && agent.state.insideBuildingId) {
        const building = this.buildings.find(b => b.id === agent.state.insideBuildingId);
        if (building?.economy) {
          for (const [itemId, qty] of Object.entries(agent.state.inventory ?? {})) {
            if (qty <= 0) continue;
            const item = ITEMS[itemId];
            if (!item) continue;
            const price = calculatePrice(item.basePrice, building.economy.inventory[itemId] ?? 0, 50);
            const sellPrice = price * 0.6; // Sell at 60% of current price
            agent.state.money = (agent.state.money ?? 0) + sellPrice;
            agent.state.inventory = { ...agent.state.inventory, [itemId]: qty - 1 };
            building.economy.inventory[itemId] = (building.economy.inventory[itemId] ?? 0) + 1;
            agent.state.currentActivity = "selling";
            break;
          }
        }
      }

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
      this.queueMemory({
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
            const result = await reflectionEngine.reflect(agent.id, agent.state, this.tickCount, this.id);
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

      // I3: Update world weather on weather events
      if (event && event.type === "weather") {
        const weatherTypes = ["rain", "snow", "fog", "storm"] as const;
        const chosen = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
        this.currentWeather = chosen;
        this.weatherIntensity = 0.2 + Math.random() * 0.6;
        this.weatherEndsAtTick = this.tickCount + 144 * (1 + Math.floor(Math.random() * 3));
        console.log(`[World] Weather changed to ${chosen} (intensity: ${this.weatherIntensity.toFixed(1)})`);
      }

      // 把目击者写入 memory
      if (event) {
        // G1.4: Apply illness to sick agents
        if (event.type === "illness") {
          const sickIds = (event.payload as any)?.sickAgentIds as string[] ?? event.witnessIds;
          for (const sickId of sickIds) {
            const sickAgent = this.agents.get(sickId);
            if (sickAgent && sickAgent.state.status === "alive") {
              const illnesses = this.eraPack?.illnesses ?? [
                { name: "风寒", severityRange: [0.2, 0.5] },
                { name: "疫病", severityRange: [0.6, 0.9] },
                { name: "旧伤复发", severityRange: [0.3, 0.6] },
              ];
              const illness = illnesses[Math.floor(Math.random() * illnesses.length)];
              const severity = illness.severityRange[0] + Math.random() * (illness.severityRange[1] - illness.severityRange[0]);
              sickAgent.state.illness = {
                name: illness.name,
                severity,
                startTick: this.tickCount,
                estimatedDuration: 144 * (3 + Math.floor(Math.random() * 7)), // 3-10 days
              };
              sickAgent.state.status = "sick";
              this.queueMemory({
                agentId: sickId,
                type: "observation",
                content: `你感染了${illness.name}。`,
                importance: 0.7,
                tick: this.tickCount,
              });
              console.log(`[World] ${sickAgent.identity.name} is sick with ${illness.name}`);
            }
          }
        }

        for (const witnessId of event.witnessIds) {
          this.queueMemory({
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

    // T5.1: Flush all pending memories at end of tick
    await this.flushMemories();

    this.tickCount++;

    // Notify listeners
    for (const callback of this.onTickCallbacks) {
      callback(this);
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNextTick();
    console.log(`[World] Started simulation at ${this.speed}x speed`);
  }

  private scheduleNextTick(): void {
    if (!this.running) return;

    const interval = this.paused ? 1000 : (1000 / this.speed);
    this.tickTimeout = setTimeout(async () => {
      if (!this.running) return;

      const start = performance.now();
      try {
        if (!this.paused) {
          await this.step();
        }
      } catch (e) {
        console.error("[World] Step failed:", e);
      }
      const elapsed = performance.now() - start;
      this.lastTickTime = elapsed;

      // Schedule next tick
      this.scheduleNextTick();
    }, interval);
  }

  stop(): void {
    this.running = false;
    if (this.tickTimeout) {
      clearTimeout(this.tickTimeout);
      this.tickTimeout = null;
    }
    console.log("[World] Stopped simulation");
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.1, speed);
    console.log(`[World] Speed set to ${this.speed}x`);
    // The next scheduled tick will use the new speed
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
    const dayOfYear = Math.floor(this.tickCount / 144) % 365;
    const season = dayOfYear < 90 ? "spring" : dayOfYear < 180 ? "summer" : dayOfYear < 270 ? "autumn" : "winter";

    return {
      id: this.id,
      name: this.name,
      tick: this.tickCount,
      speed: this.speed,
      paused: this.paused,
      season,
      weather: this.currentWeather,
      weatherIntensity: this.weatherIntensity,
      agents: Array.from(this.agents.entries()).map(([id, agent]) => ({
        id,
        identity: agent.identity,
        state: agent.state,
        dailyPlan: agent.dailyPlan,
      })),
      buildings: this.buildings,
      eraPack: this.eraPack,
    };
  }
}
