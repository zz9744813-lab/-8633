import { db } from "./index";
import { relationships, memories } from "./schema";
import { eq, and, desc } from "drizzle-orm";
import { getLLMClient } from "@/lib/llm/client";
import { memoryManager } from "@/lib/agent/memory";

export interface Relationship {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  affinity: number; // -100 to 100, how much they like/dislike each other
  familiarity: number; // 0 to 100, how well they know each other
  label?: string; // e.g., "friend", "rival", "acquaintance"
  lastInteractionTick: number;
}

export class RelationshipManager {
  // Get relationship between two agents
  async getRelationship(fromAgentId: string, toAgentId: string): Promise<Relationship | null> {
    const result = await db
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.fromAgentId, fromAgentId),
          eq(relationships.toAgentId, toAgentId)
        )
      )
      .limit(1);

    return result[0] as Relationship | null;
  }

  // Get all relationships for an agent
  async getAgentRelationships(agentId: string): Promise<Relationship[]> {
    const result = await db
      .select()
      .from(relationships)
      .where(eq(relationships.fromAgentId, agentId))
      .orderBy(desc(relationships.familiarity));

    return result as Relationship[];
  }

  // Update relationship based on interaction
  async updateRelationship(
    fromAgentId: string,
    toAgentId: string,
    affinityDelta: number,
    familiarityDelta: number,
    currentTick: number,
    interactionMemory?: string
  ): Promise<Relationship> {
    const existing = await this.getRelationship(fromAgentId, toAgentId);

    if (existing) {
      // Update existing relationship
      const newAffinity = Math.max(-100, Math.min(100, existing.affinity + affinityDelta));
      const newFamiliarity = Math.min(100, existing.familiarity + familiarityDelta);
      const newLabel = this.determineLabel(newAffinity, newFamiliarity);

      await db
        .update(relationships)
        .set({
          affinity: newAffinity,
          familiarity: newFamiliarity,
          label: newLabel,
          lastInteractionTick: currentTick,
        })
        .where(eq(relationships.id, existing.id));

      return {
        ...existing,
        affinity: newAffinity,
        familiarity: newFamiliarity,
        label: newLabel,
        lastInteractionTick: currentTick,
      };
    } else {
      // Create new relationship
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const affinity = Math.max(-100, Math.min(100, affinityDelta));
      const familiarity = Math.min(100, familiarityDelta);
      const label = this.determineLabel(affinity, familiarity);

      await db.insert(relationships).values({
        id,
        fromAgentId,
        toAgentId,
        affinity,
        familiarity,
        label,
        lastInteractionTick: currentTick,
      });

      return {
        id,
        fromAgentId,
        toAgentId,
        affinity,
        familiarity,
        label,
        lastInteractionTick: currentTick,
      };
    }
  }

  // Determine relationship label based on affinity and familiarity
  private determineLabel(affinity: number, familiarity: number): string {
    if (familiarity < 10) return "stranger";
    if (familiarity < 30) return "acquaintance";
    if (affinity > 60 && familiarity > 50) return "close friend";
    if (affinity > 30 && familiarity > 30) return "friend";
    if (affinity < -60 && familiarity > 50) return "enemy";
    if (affinity < -30 && familiarity > 30) return "rival";
    if (affinity > 0) return "friendly";
    if (affinity < 0) return "unfriendly";
    return "neutral";
  }

  // Record a positive interaction
  async recordPositiveInteraction(
    fromAgentId: string,
    toAgentId: string,
    description: string,
    strength: number,
    currentTick: number
  ): Promise<void> {
    await this.updateRelationship(fromAgentId, toAgentId, strength * 10, 5, currentTick);
    await this.updateRelationship(toAgentId, fromAgentId, strength * 10, 5, currentTick);

    // Add memory for both agents
    await memoryManager.addMemory({
      agentId: fromAgentId,
      type: "event",
      content: `Had a positive interaction with someone: ${description}`,
      importance: 0.5 + strength * 0.3,
      tick: currentTick,
      relatedAgentIds: [toAgentId],
    });

    await memoryManager.addMemory({
      agentId: toAgentId,
      type: "event",
      content: `Had a positive interaction with someone: ${description}`,
      importance: 0.5 + strength * 0.3,
      tick: currentTick,
      relatedAgentIds: [fromAgentId],
    });
  }

  // Record a negative interaction
  async recordNegativeInteraction(
    fromAgentId: string,
    toAgentId: string,
    description: string,
    strength: number,
    currentTick: number
  ): Promise<void> {
    await this.updateRelationship(fromAgentId, toAgentId, -strength * 10, 5, currentTick);
    await this.updateRelationship(toAgentId, fromAgentId, -strength * 10, 5, currentTick);

    // Add memory for both agents
    await memoryManager.addMemory({
      agentId: fromAgentId,
      type: "event",
      content: `Had a negative interaction with someone: ${description}`,
      importance: 0.6 + strength * 0.3,
      tick: currentTick,
      relatedAgentIds: [toAgentId],
    });

    await memoryManager.addMemory({
      agentId: toAgentId,
      type: "event",
      content: `Had a negative interaction with someone: ${description}`,
      importance: 0.6 + strength * 0.3,
      tick: currentTick,
      relatedAgentIds: [fromAgentId],
    });
  }

  // Get relationship summary for an agent (for LLM context)
  async getRelationshipSummary(agentId: string): Promise<string> {
    const relationships = await this.getAgentRelationships(agentId);

    if (relationships.length === 0) {
      return "You don't know many people yet.";
    }

    const summaries = await Promise.all(
      relationships
        .filter((r) => r.familiarity > 10)
        .slice(0, 5)
        .map(async (r) => {
          // Get the other agent's name
          const agentMemories = await memoryManager.getMemoriesAbout(agentId, [r.toAgentId]);
          const name = agentMemories[0]?.content.match(/with (\w+)/)?.[1] || "someone";

          let feeling = "";
          if (r.affinity > 50) feeling = "you like them a lot";
          else if (r.affinity > 20) feeling = "you like them";
          else if (r.affinity < -50) feeling = "you strongly dislike them";
          else if (r.affinity < -20) feeling = "you don't get along with them";
          else feeling = "you feel neutral about them";

          return `- ${name}: ${r.label} (${feeling})`;
        })
    );

    return summaries.join("\n");
  }
}

// Global instance
export const relationshipManager = new RelationshipManager();
