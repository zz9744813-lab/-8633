import { db } from "./index";
import { lexicon, agentVocab } from "./schema";
import { eq, sql, and, desc } from "drizzle-orm";

export interface LexiconEntry {
  id: string;
  worldId: string;
  word: string;
  meaning: string;
  originAgentId: string;
  originTick: number;
  parentWordId: string | null;
  popularity: number;
  status: string;
}

export interface AgentVocabEntry {
  agentId: string;
  lexiconId: string;
  learnedFromAgentId: string | null;
  learnedTick: number;
  usageCount: number;
  fidelity: number;
}

export class LexiconRepository {
  async coinWord(
    worldId: string,
    word: string,
    meaning: string,
    originAgentId: string,
    originTick: number,
    parentWordId?: string
  ): Promise<LexiconEntry> {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await db.insert(lexicon).values({
      id, worldId, word, meaning, originAgentId, originTick,
      parentWordId: parentWordId ?? null,
      popularity: 0.05,
      status: "coined",
    });
    return { id, worldId, word, meaning, originAgentId, originTick, parentWordId: parentWordId ?? null, popularity: 0.05, status: "coined" };
  }

  async learnWord(agentId: string, lexiconId: string, learnedFromAgentId: string | null, tick: number, fidelity?: number): Promise<void> {
    await db.insert(agentVocab).values({
      agentId, lexiconId, learnedFromAgentId, learnedTick: tick,
      usageCount: 0, fidelity: fidelity ?? 0.6 + Math.random() * 0.3,
    }).onConflictDoNothing();
  }

  async getAgentWords(agentId: string): Promise<(AgentVocabEntry & { word: string; meaning: string })[]> {
    const result = await db
      .select({
        agentId: agentVocab.agentId,
        lexiconId: agentVocab.lexiconId,
        learnedFromAgentId: agentVocab.learnedFromAgentId,
        learnedTick: agentVocab.learnedTick,
        usageCount: agentVocab.usageCount,
        fidelity: agentVocab.fidelity,
        word: lexicon.word,
        meaning: lexicon.meaning,
      })
      .from(agentVocab)
      .innerJoin(lexicon, eq(agentVocab.lexiconId, lexicon.id))
      .where(eq(agentVocab.agentId, agentId));
    return result;
  }

  async getWorldWords(worldId: string): Promise<LexiconEntry[]> {
    return await db.select().from(lexicon).where(eq(lexicon.worldId, worldId));
  }

  async recordUsage(agentId: string, lexiconId: string): Promise<void> {
    await db.update(agentVocab)
      .set({ usageCount: sql`usage_count + 1`, fidelity: sql`MIN(1.0, fidelity + 0.01)` })
      .where(and(eq(agentVocab.agentId, agentId), eq(agentVocab.lexiconId, lexiconId)));
  }

  async updatePopularity(worldId: string, totalAgents: number): Promise<void> {
    const words = await this.getWorldWords(worldId);
    for (const w of words) {
      const count = await db.select({ count: sql<number>`COUNT(*)` }).from(agentVocab).where(eq(agentVocab.lexiconId, w.id));
      const pop = totalAgents > 0 ? (count[0]?.count ?? 0) / totalAgents : 0;
      let status = "coined";
      if (pop > 0.5) status = "mainstream";
      else if (pop > 0.2) status = "spreading";
      else if (pop <= 0.05 && w.originTick > 0) status = "fading";

      await db.update(lexicon).set({ popularity: pop, status }).where(eq(lexicon.id, w.id));
    }
  }
}

export const lexiconRepo = new LexiconRepository();
