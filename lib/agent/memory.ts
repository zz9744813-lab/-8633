import { Memory, AgentState } from "@/lib/types";

// Short-term memory: lasts ~10 ticks
const STM_DURATION_TICKS = 10;

// Importance threshold for LTM promotion
const LTM_IMPORTANCE_THRESHOLD = 0.6;

// Maximum STM size per agent
const MAX_STM_SIZE = 50;

export class MemoryManager {
  private stm: Map<string, Memory[]> = new Map(); // agentId -> memories
  private ltm: Map<string, Memory[]> = new Map(); // agentId -> memories

  // Add a new memory
  addMemory(
    agentId: string,
    content: string,
    type: Memory["type"],
    importance: number,
    relatedAgentIds: string[] = [],
    metadata: Record<string, unknown> = {}
  ): Memory {
    const memory: Memory = {
      id: generateId(),
      agentId,
      content,
      type,
      importance,
      timestamp: Date.now(),
      tickCreated: this.getCurrentTick(),
      relatedAgentIds,
      metadata,
    };

    // Add to STM
    const agentStm = this.stm.get(agentId) || [];
    agentStm.push(memory);

    // Enforce STM size limit
    if (agentStm.length > MAX_STM_SIZE) {
      const removed = agentStm.shift(); // Remove oldest
      if (removed && removed.importance >= LTM_IMPORTANCE_THRESHOLD) {
        // Promote important old memories to LTM
        this.addToLTM(agentId, removed);
      }
    }

    this.stm.set(agentId, agentStm);

    // High importance memories go directly to LTM
    if (importance >= LTM_IMPORTANCE_THRESHOLD) {
      this.addToLTM(agentId, memory);
    }

    return memory;
  }

  // Get all memories for an agent (STM + LTM)
  getAllMemories(agentId: string): Memory[] {
    const stm = this.stm.get(agentId) || [];
    const ltm = this.ltm.get(agentId) || [];
    return [...stm, ...ltm];
  }

  // Get recent memories (STM)
  getRecentMemories(agentId: string, limit: number = 10): Memory[] {
    const stm = this.stm.get(agentId) || [];
    return stm.slice(-limit).reverse();
  }

  // Get important memories (LTM)
  getImportantMemories(agentId: string, minImportance: number = 0.7): Memory[] {
    const ltm = this.ltm.get(agentId) || [];
    return ltm.filter((m) => m.importance >= minImportance);
  }

  // Search memories by content (simple keyword search for now)
  searchMemories(agentId: string, query: string): Memory[] {
    const all = this.getAllMemories(agentId);
    const keywords = query.toLowerCase().split(" ");
    return all.filter((m) =>
      keywords.some((kw) => m.content.toLowerCase().includes(kw))
    );
  }

  // Get memories about a specific agent
  getMemoriesAbout(agentId: string, targetAgentId: string): Memory[] {
    const all = this.getAllMemories(agentId);
    return all.filter(
      (m) =>
        m.relatedAgentIds.includes(targetAgentId) ||
        m.content.includes(targetAgentId)
    );
  }

  // Decay old STM memories
  decayMemories(currentTick: number): void {
    for (const [agentId, memories] of this.stm.entries()) {
      const validMemories = memories.filter(
        (m) => currentTick - m.tickCreated < STM_DURATION_TICKS
      );

      // Promote decaying important memories to LTM
      const decaying = memories.filter(
        (m) => currentTick - m.tickCreated >= STM_DURATION_TICKS
      );
      for (const memory of decaying) {
        if (memory.importance >= LTM_IMPORTANCE_THRESHOLD) {
          this.addToLTM(agentId, memory);
        }
      }

      if (validMemories.length !== memories.length) {
        this.stm.set(agentId, validMemories);
      }
    }
  }

  // Clear all memories for an agent
  clearMemories(agentId: string): void {
    this.stm.delete(agentId);
    this.ltm.delete(agentId);
  }

  private addToLTM(agentId: string, memory: Memory): void {
    const agentLtm = this.ltm.get(agentId) || [];
    // Avoid duplicates
    if (!agentLtm.some((m) => m.id === memory.id)) {
      agentLtm.push(memory);
      this.ltm.set(agentId, agentLtm);
    }
  }

  private getCurrentTick(): number {
    // This will be injected from the game loop
    return (global as unknown as { currentGameTick?: number }).currentGameTick || 0;
  }
}

// Reflection system
export class ReflectionEngine {
  constructor(private memoryManager: MemoryManager) {}

  // Generate a reflection based on recent experiences
  async reflect(agentId: string, agentState: AgentState): Promise<string | null> {
    const recentMemories = this.memoryManager.getRecentMemories(agentId, 20);

    if (recentMemories.length < 5) {
      return null; // Not enough experiences to reflect on
    }

    // Check if there are patterns or recurring themes
    const patterns = this.identifyPatterns(recentMemories);

    if (patterns.length > 0) {
      const reflection = `我最近注意到：${patterns.join("，")}`;

      // Store reflection as a high-importance memory
      this.memoryManager.addMemory(
        agentId,
        reflection,
        "reflection",
        0.8,
        [],
        { patterns }
      );

      return reflection;
    }

    return null;
  }

  private identifyPatterns(memories: Memory[]): string[] {
    const patterns: string[] = [];

    // Simple pattern detection
    const activityCounts = new Map<string, number>();
    for (const m of memories) {
      if (m.type === "action" || m.type === "dialogue") {
        const key = m.metadata?.activity as string;
        if (key) {
          activityCounts.set(key, (activityCounts.get(key) || 0) + 1);
        }
      }
    }

    // Report activities done more than 3 times
    for (const [activity, count] of activityCounts.entries()) {
      if (count >= 3) {
        patterns.push(`我经常${activity}（${count}次）`);
      }
    }

    return patterns;
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Global memory manager instance
export const memoryManager = new MemoryManager();
export const reflectionEngine = new ReflectionEngine(memoryManager);
