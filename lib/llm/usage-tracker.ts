export type LLMProvider = "anthropic" | "openai" | "ollama";

export interface UsageRecord {
  provider: LLMProvider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: number;
  purpose: string;
}

const COST_PER_1K_TOKENS: Record<LLMProvider, { input: number; output: number }> = {
  anthropic: { input: 0.003, output: 0.015 },
  openai: { input: 0.0025, output: 0.01 },
  ollama: { input: 0, output: 0 },
};

type ModelStats = { calls: number; promptTokens: number; completionTokens: number; cost: number };

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5":   { input: 3.0, output: 15.0 },
  "claude-haiku-4-5":    { input: 0.8, output: 4.0 },
  "claude-opus-4":       { input: 15.0, output: 75.0 },
  "gpt-4o":              { input: 2.5, output: 10.0 },
  "gpt-4o-mini":         { input: 0.15, output: 0.6 },
};

class UsageTracker {
  private records: UsageRecord[] = [];
  private maxRecords = 10000;
  private stats: Record<string, ModelStats> = {};

  private computeCost(model: string, inputTokens: number, outputTokens: number): number {
    const p = MODEL_PRICING[model] ?? { input: 1, output: 5 };
    return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  }

  recordCall(
    provider: LLMProvider,
    model: string,
    promptTokens: number,
    completionTokens: number,
    purpose: string
  ): void {
    this.records.push({
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      timestamp: Date.now(),
      purpose,
    });
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    // Update per-model stats
    const s = this.stats[model] ?? { calls: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
    s.calls++;
    s.promptTokens += promptTokens;
    s.completionTokens += completionTokens;
    s.cost += this.computeCost(model, promptTokens, completionTokens);
    this.stats[model] = s;

    // Persist to db
    const cost = this.computeCost(model, promptTokens, completionTokens);
    this.writeDbRecord(provider, model, promptTokens, completionTokens, purpose, cost).catch(() => {});
  }

  private async writeDbRecord(
    provider: LLMProvider,
    model: string,
    promptTokens: number,
    completionTokens: number,
    purpose: string,
    costUsd: number
  ): Promise<void> {
    try {
      const { db } = await import("@/db/index");
      const { llmCalls } = await import("@/db/schema");
      await db.insert(llmCalls).values({
        id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        agentId: null,
        purpose: purpose ?? "unknown",
        model,
        promptTokens,
        completionTokens,
        costUsd,
        durationMs: null,
        tick: null,
      });
    } catch (e) {
      console.error("[Usage] DB write failed:", e);
    }
  }

  async initialize(): Promise<void> {
    try {
      const { db } = await import("@/db/index");
      const { llmCalls } = await import("@/db/schema");
      const { sql } = await import("drizzle-orm");
      const rows = await db.select({
        model: llmCalls.model,
        totalIn: sql<number>`sum(${llmCalls.promptTokens})`,
        totalOut: sql<number>`sum(${llmCalls.completionTokens})`,
        totalCost: sql<number>`sum(${llmCalls.costUsd})`,
        count: sql<number>`count(*)`,
      }).from(llmCalls).groupBy(llmCalls.model);

      for (const row of rows) {
        if (!row.model) continue;
        this.stats[row.model] = {
          calls: row.count,
          promptTokens: row.totalIn ?? 0,
          completionTokens: row.totalOut ?? 0,
          cost: row.totalCost ?? 0,
        };
      }
      console.log(`[Usage] Loaded ${rows.length} historical model stats from db`);
    } catch (e) {
      console.error("[Usage] Initialize failed:", e);
    }
  }

  getStats() {
    // Merge runtime records into stats for the current view
    const merged: Record<string, ModelStats> = {};
    for (const [model, s] of Object.entries(this.stats)) {
      merged[model] = { ...s };
    }
    for (const r of this.records) {
      const s = merged[r.model] ?? { calls: 0, promptTokens: 0, completionTokens: 0, cost: 0 };
      s.calls++;
      s.promptTokens += r.promptTokens;
      s.completionTokens += r.completionTokens;
      s.cost += this.computeCost(r.model, r.promptTokens, r.completionTokens);
      merged[r.model] = s;
    }

    const totalCalls = Object.values(merged).reduce((s, m) => s + m.calls, 0);
    const totalTokens = Object.values(merged).reduce((s, m) => s + m.promptTokens + m.completionTokens, 0);
    const totalPromptTokens = Object.values(merged).reduce((s, m) => s + m.promptTokens, 0);
    const totalCompletionTokens = Object.values(merged).reduce((s, m) => s + m.completionTokens, 0);
    const totalCost = Object.values(merged).reduce((s, m) => s + m.cost, 0);
    const callsByPurpose = this.records.reduce<Record<string, number>>((acc, r) => {
      acc[r.purpose] = (acc[r.purpose] ?? 0) + 1;
      return acc;
    }, {});
    const tokensByPurpose = this.records.reduce<Record<string, number>>((acc, r) => {
      acc[r.purpose] = (acc[r.purpose] ?? 0) + r.promptTokens + r.completionTokens;
      return acc;
    }, {});

    return {
      totalCalls,
      totalTokens,
      totalPromptTokens,
      totalCompletionTokens,
      totalCost,
      callsByPurpose,
      tokensByPurpose,
      averageTokensPerCall: totalCalls > 0 ? Math.round(totalTokens / totalCalls) : 0,
    };
  }

  getRecentCalls(count = 50): UsageRecord[] {
    return this.records.slice(-count).reverse();
  }

  reset(): void {
    this.records = [];
    this.stats = {};
  }
}

export const usageTracker = new UsageTracker();
