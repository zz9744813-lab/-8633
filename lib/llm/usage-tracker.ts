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

class UsageTracker {
  private records: UsageRecord[] = [];
  private maxRecords = 10000;

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
  }

  getStats() {
    const totalCalls = this.records.length;
    const totalTokens = this.records.reduce((s, r) => s + r.totalTokens, 0);
    const totalPromptTokens = this.records.reduce((s, r) => s + r.promptTokens, 0);
    const totalCompletionTokens = this.records.reduce((s, r) => s + r.completionTokens, 0);
    const totalCost = this.records.reduce((s, r) => {
      const rate = COST_PER_1K_TOKENS[r.provider] ?? { input: 0, output: 0 };
      return s + (r.promptTokens / 1000) * rate.input + (r.completionTokens / 1000) * rate.output;
    }, 0);

    const callsByPurpose = this.records.reduce<Record<string, number>>((acc, r) => {
      acc[r.purpose] = (acc[r.purpose] ?? 0) + 1;
      return acc;
    }, {});

    const tokensByPurpose = this.records.reduce<Record<string, number>>((acc, r) => {
      acc[r.purpose] = (acc[r.purpose] ?? 0) + r.totalTokens;
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
  }
}

export const usageTracker = new UsageTracker();
