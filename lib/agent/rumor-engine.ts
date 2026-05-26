import { RumorRepository, rumorRepo, RumorType } from "@/db/rumor-repository";
import { MemoryManager, memoryManager } from "./memory";
import { Agent } from "./agent";
import { World } from "./world";
import { getLLMClient } from "@/lib/llm/client";
import { z } from "zod";

// Rumor engine for handling rumor creation and spread
export class RumorEngine {
  private repo: RumorRepository;
  private memoryManager: MemoryManager;

  constructor(
    repo: RumorRepository = rumorRepo,
    mm?: MemoryManager
  ) {
    this.repo = repo;
    this.memoryManager = mm ?? memoryManager;
  }

  // Create a rumor from a memory or event
  async createRumor(
    world: World,
    originator: Agent,
    type: RumorType,
    subject: string,
    content: string,
    truthLevel: number = 0.5,
    sourceMemoryId?: string
  ): Promise<string> {
    const rumor = await this.repo.create({
      worldId: world.id,
      originatorId: originator.id,
      tick: world.tickCount,
      type,
      subject,
      content,
      truthLevel,
      spreadCount: 1,
      knownByIds: [originator.id],
      sourceMemoryId,
    });

    // Record in originator's memory
    await this.memoryManager.addMemory({
      agentId: originator.id,
      type: "rumor",
      content: `我听说${subject}${content}`,
      importance: 0.6,
      tick: world.tickCount,
    });

    return rumor.id;
  }

  // Try to spread a rumor during conversation
  async trySpreadRumor(
    world: World,
    speaker: Agent,
    listener: Agent,
    topic?: string
  ): Promise<{ rumorId?: string; content?: string; distorted: boolean } | null> {
    // Get rumors known by speaker
    const knownRumors = await this.repo.getKnownByAgent(speaker.id, world.id);
    if (knownRumors.length === 0) return null;

    // Select a relevant rumor (simple: pick one randomly, could be smarter)
    const rumor = knownRumors[Math.floor(Math.random() * knownRumors.length)];

    // Check if listener already knows it
    if (rumor.knownByIds?.includes(listener.id)) return null;

    // Determine if rumor gets distorted
    const distortionChance = 0.3 + ((rumor.spreadCount ?? 0) * 0.1); // More spread = more distortion
    const shouldDistort = Math.random() < distortionChance;

    let finalContent = rumor.content;
    let distortionLevel = 0;

    if (shouldDistort) {
      const distortionResult = await this.distortRumor(rumor.content, speaker, listener);
      finalContent = distortionResult.content;
      distortionLevel = distortionResult.level;
    }

    // Update rumor spread
    const newKnownByIds = [...(rumor.knownByIds ?? []), listener.id];
    await this.repo.updateSpread(
      rumor.id,
      newKnownByIds,
      (rumor.spreadCount ?? 0) + 1,
      shouldDistort ? finalContent : undefined
    );

    // Record in listener's memory
    await this.memoryManager.addMemory({
      agentId: listener.id,
      type: "rumor",
      content: `${speaker.identity.name}告诉我：${rumor.subject}${finalContent}`,
      importance: 0.5 + (distortionLevel * 0.2),
      tick: world.tickCount,
      relatedAgentIds: [speaker.id],
    });

    // Record in speaker's memory that they spread it
    await this.memoryManager.addMemory({
      agentId: speaker.id,
      type: "rumor",
      content: `我告诉${listener.identity.name}：${rumor.subject}${finalContent}`,
      importance: 0.4,
      tick: world.tickCount,
      relatedAgentIds: [listener.id],
    });

    return {
      rumorId: rumor.id,
      content: finalContent,
      distorted: shouldDistort,
    };
  }

  // Distort a rumor using LLM
  private async distortRumor(
    originalContent: string,
    spreader: Agent,
    listener: Agent
  ): Promise<{ content: string; level: number }> {
    try {
      const llm = getLLMClient();

      const systemPrompt = `You are distorting a rumor as it passes from one person to another.
Modify the rumor slightly to reflect:
1. The spreader's personality and biases
2. Natural information loss in retelling
3. Possible exaggeration or dramatization

Keep the core subject the same but change details subtly.`;

      const prompt = `Original rumor: "${originalContent}"

Spreader: ${spreader.identity.name}, a ${spreader.identity.occupation}
Character: ${spreader.identity.personality.traits.join(", ")}

Listener: ${listener.identity.name}, a ${listener.identity.occupation}

Rewrite this rumor as it might be told, with slight changes or exaggerations:`;

      const DistortionSchema = z.object({
        distortedContent: z.string().describe("The slightly changed rumor"),
        distortionLevel: z.number().min(0).max(1).describe("How much was changed (0.1=slight, 0.8=major)"),
      });

      const result = await llm.generateObject(prompt, DistortionSchema, systemPrompt);

      return {
        content: result.distortedContent,
        level: result.distortionLevel,
      };
    } catch (error) {
      console.error("[RumorEngine] Failed to distort rumor:", error);
      // Return original with slight random modification
      return {
        content: originalContent + "（据说）",
        level: 0.2,
      };
    }
  }

  // Generate a rumor from an agent's memory
  async generateRumorFromMemory(
    world: World,
    agent: Agent
  ): Promise<{ rumorId?: string; type: RumorType; subject: string; content: string } | null> {
    // Get interesting memories
    const memories = await this.memoryManager.getLTM(agent.id, world.tickCount, 20);
    const interestingMemories = memories.filter((m) => m.importance > 0.6);

    if (interestingMemories.length === 0) return null;

    const memory = interestingMemories[Math.floor(Math.random() * interestingMemories.length)];

    // Determine rumor type from memory content
    const type = this.classifyRumorType(memory.content);
    const subject = this.extractSubject(memory.content);

    // Create the rumor
    const rumorId = await this.createRumor(
      world,
      agent,
      type,
      subject,
      memory.content,
      0.7, // High truth level since from memory
      memory.id
    );

    return {
      rumorId,
      type,
      subject,
      content: memory.content,
    };
  }

  // Classify rumor type from content
  private classifyRumorType(content: string): RumorType {
    const lower = content.toLowerCase();
    if (lower.includes("秘密") || lower.includes("隐藏")) return "secret";
    if (lower.includes("丑闻") || lower.includes("背叛")) return "scandal";
    if (lower.includes("危险") || lower.includes("威胁")) return "danger";
    if (lower.includes("关系") || lower.includes("喜欢") || lower.includes("恨")) return "relationship";
    if (lower.includes("成就") || lower.includes("成功")) return "achievement";
    return "event";
  }

  // Extract subject from content
  private extractSubject(content: string): string {
    // Simple extraction - first few words or any mentioned name
    const words = content.split(/[，。！？\s]/);
    if (words.length > 0) {
      return words[0].substring(0, 20);
    }
    return "某人";
  }

  // Get hot rumors (widely spread)
  async getHotRumors(worldId: string, minSpread: number = 3): Promise<string[]> {
    const rumors = await this.repo.getHotRumors(worldId, minSpread);
    return rumors.map((r) => `[${r.type}] ${r.subject}${r.content} (${r.spreadCount}人知道)`);
  }

  // Get rumors about a specific agent
  async getRumorsAbout(worldId: string, agentId: string): Promise<string[]> {
    const allRumors = await this.repo.getWorldRumors(worldId, 100);
    return allRumors
      .filter((r) => r.subject.includes(agentId) || r.content.includes(agentId))
      .map((r) => r.content);
  }
}

// Global instance
export const rumorEngine = new RumorEngine();
