import { MemoryManager, memoryManager } from "./memory";
import { relationshipManager } from "@/db/relationship-repository";
import { Agent } from "./agent";
import { World } from "./world";
import { getLLMClient } from "@/lib/llm/client";
import { z } from "zod";
import { chronicleEngine } from "./chronicle-engine";
import { rumorEngine } from "./rumor-engine";

// Drama trigger types
export type DramaType =
  | "love_triangle"      // 三角恋
  | "betrayal"          // 背叛
  | "revenge"           // 复仇
  | "rivalry"           // 竞争
  | "family_conflict"   // 家庭冲突
  | "ambition_clash"    // 野心冲突
  | "secret_revealed"   // 秘密揭露
  | "unexpected_alliance"; // 意外联盟

export interface DramaEvent {
  type: DramaType;
  description: string;
  involvedAgentIds: string[];
  impact: {
    relationshipChanges: { from: string; to: string; delta: number }[];
    goalChanges?: { agentId: string; add?: string[]; remove?: string[] }[];
  };
}

// Drama engine for detecting and triggering dramatic events
export class DramaEngine {
  private memoryManager: MemoryManager;
  private triggeredDramas: Set<string> = new Set(); // Track to avoid duplicates

  constructor(mm?: MemoryManager) {
    this.memoryManager = mm ?? memoryManager;
  }

  // Check for potential dramatic situations
  async checkForDrama(world: World): Promise<DramaEvent | null> {
    const agents = Array.from(world.agents.values());
    if (agents.length < 3) return null; // Need at least 3 agents for drama

    // Calculate interval based on narrative intensity (default 0.3)
    const dayNumber = Math.floor(world.tickCount / 144);
    const intensity = world.eraPack?.narrativeIntensity ?? 0.3;
    const interval = Math.round(7 - 5 * intensity);
    if (dayNumber % interval !== 0) return null;

    // Check each drama type
    const checks = [
      this.checkLoveTriangle(world, agents),
      this.checkBetrayal(world, agents),
      this.checkRivalry(world, agents),
      this.checkSecretRevealed(world, agents),
      this.checkAmbitionClash(world, agents),
    ];

    for (const check of checks) {
      const drama = await check;
      if (drama) return drama;
    }

    return null;
  }

  // F4.1: Love triangle detection
  private async checkLoveTriangle(world: World, agents: Agent[]): Promise<DramaEvent | null> {
    for (const agentA of agents) {
      const relationsA = await relationshipManager.getAgentRelationships(agentA.id);

      for (const rel of relationsA) {
        // Find positive relationships (potential romantic interest)
        if (rel.affinity > 0.5 && rel.label?.includes("friend")) {
          const agentB = world.agents.get(rel.toAgentId);
          if (!agentB) continue;

          // Check if both A and B have high affinity with a third person C
          const relationsB = await relationshipManager.getAgentRelationships(agentB.id);

          for (const relB of relationsB) {
            if (relB.toAgentId === agentA.id) continue; // Skip back to A

            if (relB.affinity > 0.5) {
              const agentC = world.agents.get(relB.toAgentId);
              if (!agentC) continue;

              // Check if A also has high affinity with C
              const relAC = await relationshipManager.getRelationship(agentA.id, agentC.id);
              if (relAC && relAC.affinity > 0.5) {
                const dramaKey = `love-triangle-${agentA.id}-${agentB.id}-${agentC.id}`;
                if (this.triggeredDramas.has(dramaKey)) continue;
                this.triggeredDramas.add(dramaKey);

                return {
                  type: "love_triangle",
                  description: `${agentA.identity.name}、${agentB.identity.name}和${agentC.identity.name}之间似乎产生了微妙的感情纠葛...`,
                  involvedAgentIds: [agentA.id, agentB.id, agentC.id],
                  impact: {
                    relationshipChanges: [
                      { from: agentA.id, to: agentB.id, delta: -0.2 },
                      { from: agentA.id, to: agentC.id, delta: -0.2 },
                      { from: agentB.id, to: agentC.id, delta: -0.3 },
                    ],
                  },
                };
              }
            }
          }
        }
      }
    }
    return null;
  }

  // F4.2: Betrayal detection
  private async checkBetrayal(world: World, agents: Agent[]): Promise<DramaEvent | null> {
    for (const agent of agents) {
      // Look for negative memories about someone they had good relations with
      const memories = await this.memoryManager.getSTM(agent.id, world.tickCount, 30);
      const negativeMemories = memories.filter(
        (m) => m.importance > 0.6 && (m.content.includes("背叛") || m.content.includes("欺骗") || m.content.includes("伤害"))
      );

      for (const memory of negativeMemories) {
        // Extract who betrayed them
        const relatedIds = memory.relatedAgentIds || [];
        for (const betrayerId of relatedIds) {
          const betrayer = world.agents.get(betrayerId);
          if (!betrayer) continue;

          const rel = await relationshipManager.getRelationship(agent.id, betrayerId);
          if (rel && rel.affinity > 0.3) {
            // Was a friend, now betrayal
            const dramaKey = `betrayal-${agent.id}-${betrayerId}-${memory.id}`;
            if (this.triggeredDramas.has(dramaKey)) continue;
            this.triggeredDramas.add(dramaKey);

            return {
              type: "betrayal",
              description: `${agent.identity.name}感到被${betrayer.identity.name}深深背叛了...`,
              involvedAgentIds: [agent.id, betrayerId],
              impact: {
                relationshipChanges: [
                  { from: agent.id, to: betrayerId, delta: -0.8 },
                  { from: betrayerId, to: agent.id, delta: -0.5 },
                ],
                goalChanges: [
                  {
                    agentId: agent.id,
                    add: [`报复${betrayer.identity.name}`],
                  },
                ],
              },
            };
          }
        }
      }
    }
    return null;
  }

  // F4.3: Rivalry detection
  private async checkRivalry(world: World, agents: Agent[]): Promise<DramaEvent | null> {
    // Find agents with same occupation
    const occupationGroups = new Map<string, Agent[]>();
    for (const agent of agents) {
      const occ = agent.identity.occupation;
      if (!occupationGroups.has(occ)) {
        occupationGroups.set(occ, []);
      }
      occupationGroups.get(occ)!.push(agent);
    }

    for (const [occ, group] of occupationGroups) {
      if (group.length < 2) continue;

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const agentA = group[i];
          const agentB = group[j];

          const rel = await relationshipManager.getRelationship(agentA.id, agentB.id);
          if (rel && rel.affinity < 0 && rel.affinity > -0.5) {
            // Mild negative - potential rivalry
            const dramaKey = `rivalry-${agentA.id}-${agentB.id}`;
            if (this.triggeredDramas.has(dramaKey)) continue;
            this.triggeredDramas.add(dramaKey);

            return {
              type: "rivalry",
              description: `${agentA.identity.name}和${agentB.identity.name}作为同行的${occ}，彼此之间的竞争日益激烈...`,
              involvedAgentIds: [agentA.id, agentB.id],
              impact: {
                relationshipChanges: [
                  { from: agentA.id, to: agentB.id, delta: -0.3 },
                  { from: agentB.id, to: agentA.id, delta: -0.3 },
                ],
                goalChanges: [
                  {
                    agentId: agentA.id,
                    add: [`超越${agentB.identity.name}`],
                  },
                  {
                    agentId: agentB.id,
                    add: [`超越${agentA.identity.name}`],
                  },
                ],
              },
            };
          }
        }
      }
    }
    return null;
  }

  // F4.4: Secret revealed
  private async checkSecretRevealed(world: World, agents: Agent[]): Promise<DramaEvent | null> {
    // Check for secrets in memories that become known to others
    for (const agent of agents) {
      const memories = await this.memoryManager.getSTM(agent.id, world.tickCount, 20);
      const secretMemories = memories.filter(
        (m) =>
          m.importance > 0.7 &&
          (m.content.includes("秘密") || m.content.includes("隐藏") || m.content.includes("私"))
      );

      if (secretMemories.length > 0 && Math.random() < 0.1) {
        // 10% chance to have secret revealed
        const secret = secretMemories[0];
        const dramaKey = `secret-${agent.id}-${secret.id}`;
        if (this.triggeredDramas.has(dramaKey)) return null;
        this.triggeredDramas.add(dramaKey);

        // Find who learned the secret
        const otherAgents = agents.filter((a) => a.id !== agent.id);
        const revealer = otherAgents[Math.floor(Math.random() * otherAgents.length)];

        return {
          type: "secret_revealed",
          description: `${revealer.identity.name}发现了${agent.identity.name}的一个秘密...`,
          involvedAgentIds: [agent.id, revealer.id],
          impact: {
            relationshipChanges: [
              { from: agent.id, to: revealer.id, delta: -0.4 },
              { from: revealer.id, to: agent.id, delta: 0.1 },
            ],
          },
        };
      }
    }
    return null;
  }

  // F4.5: Ambition clash - conflicting long-term goals
  private async checkAmbitionClash(world: World, agents: Agent[]): Promise<DramaEvent | null> {
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const agentA = agents[i];
        const agentB = agents[j];

        const goalsA = agentA.state.currentGoals || [];
        const goalsB = agentB.state.currentGoals || [];

        // Check for conflicting goals (simple string overlap)
        for (const goalA of goalsA) {
          for (const goalB of goalsB) {
            if (this.goalsConflict(goalA, goalB)) {
              const dramaKey = `ambition-${agentA.id}-${agentB.id}`;
              if (this.triggeredDramas.has(dramaKey)) continue;
              this.triggeredDramas.add(dramaKey);

              return {
                type: "ambition_clash",
                description: `${agentA.identity.name}和${agentB.identity.name}的目标产生了冲突...`,
                involvedAgentIds: [agentA.id, agentB.id],
                impact: {
                  relationshipChanges: [
                    { from: agentA.id, to: agentB.id, delta: -0.3 },
                    { from: agentB.id, to: agentA.id, delta: -0.3 },
                  ],
                },
              };
            }
          }
        }
      }
    }
    return null;
  }

  // Check if two goals conflict (simplified)
  private goalsConflict(goalA: string, goalB: string): boolean {
    const keywordsA = goalA.split(/[，。！？\s]/);
    const keywordsB = goalB.split(/[，。！？\s]/);

    // Check for opposing keywords
    const opposites: Record<string, string[]> = {
      帮助: ["伤害", "击败"],
      保护: ["摧毁", "破坏"],
      击败: ["帮助", "保护"],
    };

    for (const word of keywordsA) {
      if (opposites[word]) {
        for (const opp of opposites[word]) {
          if (keywordsB.some((k) => k.includes(opp))) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Execute a drama event
  async executeDrama(world: World, drama: DramaEvent): Promise<void> {
    console.log(`[Drama] ${drama.type}: ${drama.description}`);

    // Apply relationship changes
    for (const change of drama.impact.relationshipChanges) {
      const current = await relationshipManager.getRelationship(change.from, change.to);
      await relationshipManager.updateRelationship(change.from, change.to, change.delta * 10, 5, world.tickCount);
    }

    // Apply goal changes
    if (drama.impact.goalChanges) {
      for (const goalChange of drama.impact.goalChanges) {
        const agent = world.agents.get(goalChange.agentId);
        if (!agent) continue;

        const currentGoals = agent.state.currentGoals || [];

        if (goalChange.remove) {
          for (const goal of goalChange.remove) {
            const idx = currentGoals.indexOf(goal);
            if (idx !== -1) currentGoals.splice(idx, 1);
          }
        }

        if (goalChange.add) {
          for (const goal of goalChange.add) {
            if (!currentGoals.includes(goal)) {
              currentGoals.push(goal);
            }
          }
        }

        agent.state.currentGoals = currentGoals;
      }
    }

    // Record in memories of involved agents
    for (const agentId of drama.involvedAgentIds) {
      await this.memoryManager.addMemory({
        agentId,
        type: "event",
        content: drama.description,
        importance: 0.8,
        tick: world.tickCount,
        relatedAgentIds: drama.involvedAgentIds.filter((id) => id !== agentId),
      });
    }

    // Record in chronicle
    await chronicleEngine.recordMilestone(
      world,
      this.getDramaTitle(drama.type),
      drama.description,
      drama.involvedAgentIds,
      0.8
    );

    // Create rumor about the drama
    if (drama.involvedAgentIds.length >= 2) {
      const agentA = world.agents.get(drama.involvedAgentIds[0]);
      if (agentA) {
        await rumorEngine.createRumor(
          world,
          agentA,
          drama.type === "love_triangle" ? "relationship" : drama.type === "betrayal" ? "scandal" : "event",
          drama.involvedAgentIds.map((id) => world.agents.get(id)?.identity.name).join("、"),
          drama.description,
          0.6,
          undefined
        );
      }
    }
  }

  private getDramaTitle(type: DramaType): string {
    const titles: Record<DramaType, string> = {
      love_triangle: "三角纠葛",
      betrayal: "背叛之痛",
      revenge: "复仇之火",
      rivalry: "宿敌之争",
      family_conflict: "家庭纷争",
      ambition_clash: "野心碰撞",
      secret_revealed: "秘密揭露",
      unexpected_alliance: "意外联盟",
    };
    return titles[type] || "戏剧性事件";
  }

  // Clear old drama tracking (call periodically)
  clearTracking(): void {
    this.triggeredDramas.clear();
  }
}

// Global instance
export const dramaEngine = new DramaEngine();
