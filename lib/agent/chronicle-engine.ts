import { ChronicleRepository, chronicleRepo, ChronicleType } from "@/db/chronicle-repository";
import { World } from "@/lib/agent/world";
import { Agent } from "@/lib/agent/agent";
import { memoryManager } from "./memory";
import { worldEventSystem } from "@/db/world-event-repository";
import { getLLMClient, getLLMClientFor } from "@/lib/llm/client";
import { z } from "zod";
import { lintArray } from "@/lib/safety/lint";
import { lintEraOutput, buildRetrySuffix } from "@/lib/era-pack/lint";

// Season mapping from tick
function getSeasonFromTick(tick: number): string {
  const dayOfYear = Math.floor(tick / 144) % 365;
  if (dayOfYear < 90) return "spring";
  if (dayOfYear < 180) return "summer";
  if (dayOfYear < 270) return "autumn";
  return "winter";
}

// Chronicle engine for recording world history
export class ChronicleEngine {
  private repo: ChronicleRepository;

  constructor(repo: ChronicleRepository = chronicleRepo) {
    this.repo = repo;
  }

  // Record agent birth
  async recordBirth(world: World, agent: Agent): Promise<void> {
    const year = this.getYear(world);
    const season = getSeasonFromTick(world.tickCount);
    const day = Math.floor(world.tickCount / 144) % 365 + 1;

    await this.repo.create({
      worldId: world.id,
      tick: world.tickCount,
      year,
      season,
      day,
      type: "birth",
      title: `${agent.identity.name} 诞生`,
      description: `${agent.identity.name}，${agent.identity.age}岁的${agent.identity.occupation}，来到了这个世界。${agent.identity.backstory.substring(0, 100)}...`,
      agentIds: [agent.id],
      importance: 0.6,
      metadata: {
        agentName: agent.identity.name,
        occupation: agent.identity.occupation,
        age: agent.identity.age,
      },
    });
  }

  // Record agent death
  async recordDeath(world: World, agent: Agent, cause?: string): Promise<void> {
    const year = this.getYear(world);
    const season = getSeasonFromTick(world.tickCount);
    const day = Math.floor(world.tickCount / 144) % 365 + 1;

    await this.repo.create({
      worldId: world.id,
      tick: world.tickCount,
      year,
      season,
      day,
      type: "death",
      title: `${agent.identity.name} 离世`,
      description: cause
        ? `${agent.identity.name}因${cause}而离世，享年${agent.identity.age}岁。`
        : `${agent.identity.name}在${agent.identity.age}岁时离世。`,
      agentIds: [agent.id],
      importance: 0.7,
      metadata: {
        agentName: agent.identity.name,
        age: agent.identity.age,
        cause,
      },
    });
  }

  // Record building construction
  async recordBuilding(world: World, building: {
    id: string;
    name: string;
    type: string;
    ownerId?: string;
    ownerName?: string;
  }): Promise<void> {
    const year = this.getYear(world);
    const season = getSeasonFromTick(world.tickCount);
    const day = Math.floor(world.tickCount / 144) % 365 + 1;

    await this.repo.create({
      worldId: world.id,
      tick: world.tickCount,
      year,
      season,
      day,
      type: "building",
      title: `${building.name} 建成`,
      description: building.ownerName
        ? `${building.name}（${building.type}）由${building.ownerName}建造完成。`
        : `${building.name}（${building.type}）建造完成。`,
      buildingIds: [building.id],
      agentIds: building.ownerId ? [building.ownerId] : undefined,
      importance: 0.5,
      metadata: {
        buildingName: building.name,
        buildingType: building.type,
        ownerName: building.ownerName,
      },
    });
  }

  // Record marriage/relationship milestone
  async recordMarriage(world: World, agent1: Agent, agent2: Agent): Promise<void> {
    const year = this.getYear(world);
    const season = getSeasonFromTick(world.tickCount);
    const day = Math.floor(world.tickCount / 144) % 365 + 1;

    await this.repo.create({
      worldId: world.id,
      tick: world.tickCount,
      year,
      season,
      day,
      type: "marriage",
      title: `${agent1.identity.name} 与 ${agent2.identity.name} 结缘`,
      description: `在众人的祝福中，${agent1.identity.name}与${agent2.identity.name}走到了一起。`,
      agentIds: [agent1.id, agent2.id],
      importance: 0.8,
      metadata: {
        agent1Name: agent1.identity.name,
        agent2Name: agent2.identity.name,
      },
    });
  }

  // Record disaster/world event
  async recordDisaster(
    world: World,
    eventType: string,
    description: string,
    affectedAgentIds?: string[]
  ): Promise<void> {
    const year = this.getYear(world);
    const season = getSeasonFromTick(world.tickCount);
    const day = Math.floor(world.tickCount / 144) % 365 + 1;

    await this.repo.create({
      worldId: world.id,
      tick: world.tickCount,
      year,
      season,
      day,
      type: "disaster",
      title: eventType,
      description,
      agentIds: affectedAgentIds,
      importance: 0.85,
      metadata: {
        eventType,
        affectedCount: affectedAgentIds?.length ?? 0,
      },
    });
  }

  // Record generic milestone
  async recordMilestone(
    world: World,
    title: string,
    description: string,
    agentIds?: string[],
    importance: number = 0.5
  ): Promise<void> {
    const year = this.getYear(world);
    const season = getSeasonFromTick(world.tickCount);
    const day = Math.floor(world.tickCount / 144) % 365 + 1;

    await this.repo.create({
      worldId: world.id,
      tick: world.tickCount,
      year,
      season,
      day,
      type: "milestone",
      title,
      description,
      agentIds,
      importance,
    });
  }

  // Record achievement
  async recordAchievement(
    world: World,
    agent: Agent,
    achievement: string,
    description: string,
    importance: number = 0.6
  ): Promise<void> {
    const year = this.getYear(world);
    const season = getSeasonFromTick(world.tickCount);
    const day = Math.floor(world.tickCount / 144) % 365 + 1;

    await this.repo.create({
      worldId: world.id,
      tick: world.tickCount,
      year,
      season,
      day,
      type: "achievement",
      title: `${agent.identity.name}：${achievement}`,
      description,
      agentIds: [agent.id],
      importance,
      metadata: {
        agentName: agent.identity.name,
        achievement,
      },
    });
  }

  // Get year from tick
  private getYear(world: World): number {
    const days = Math.floor(world.tickCount / 144);
    return 1 + Math.floor(days / 365);
  }

  // Get current game date info
  getGameDate(tick: number): { year: number; season: string; day: number } {
    const days = Math.floor(tick / 144);
    const year = 1 + Math.floor(days / 365);
    const dayOfYear = days % 365;
    const day = dayOfYear + 1;
    const season = getSeasonFromTick(tick);
    return { year, season, day };
  }

  // F1: Generate daily summary in chronicle style
  async generateDailySummary(world: World, dayNumber: number): Promise<void> {
    const agents = Array.from(world.agents.values());
    if (agents.length === 0) return;

    // Collect important memories from all agents (importance >= 0.5)
    const allImportantMemories: Array<{
      agentName: string;
      content: string;
      importance: number;
      tick: number;
    }> = [];

    for (const agent of agents) {
      const memories = await memoryManager.getSTM(agent.id, world.tickCount, 50);
      const importantMemories = memories.filter((m) => m.importance >= 0.5);
      for (const memory of importantMemories) {
        allImportantMemories.push({
          agentName: agent.identity.name,
          content: memory.content,
          importance: memory.importance,
          tick: memory.tick,
        });
      }
    }

    // Sort by importance and take top 20
    allImportantMemories.sort((a, b) => b.importance - a.importance);
    const topMemories = allImportantMemories.slice(0, 20);

    // Collect today's world events
    const dayStartTick = dayNumber * 144;
    const dayEndTick = (dayNumber + 1) * 144;
    const recentEvents = await worldEventSystem.getRecentEvents(world.id, 20);
    const todayEvents = recentEvents.filter(
      (e) => e.tick >= dayStartTick && e.tick < dayEndTick
    );

    // Get era pack context
    const eraPack = world.eraPack;
    const worldPrompt = eraPack?.worldPrompt ?? "你生活在一个小镇上。";
    const dialogueStyle = eraPack?.dialogueStyle ?? "";

    // Build system prompt
    const systemPrompt = `${worldPrompt}

你是这个小镇的史官，写"县志"，风格简练有"史书感"。
${dialogueStyle}

要求：
- 输出 3-6 条纪事，每条 30-80 字
- 使用中文，文言或半文言风格
- 以"是日，本镇..."开头
- 记录当天重要事件、人物活动
- 风格庄重、简练，有历史感`;

    // Build user prompt
    const memoriesText = topMemories
      .map((m) => `- ${m.agentName}: ${m.content}`)
      .join("\n");
    const eventsText = todayEvents
      .map((e) => `- ${e.type}: ${e.description}`)
      .join("\n") || "无";

    const prompt = `请根据以下第 ${dayNumber} 天的记录，撰写一份县志风格的每日总结：

【重要人物活动】
${memoriesText}

【世界事件】
${eventsText}

请输出 3-6 条纪事，每条独立成段，30-80 字。`;

    try {
      const llm = getLLMClientFor("chronicle");

      const DailySummarySchema = z.object({
        entries: z
          .array(z.string().min(10).max(100))
          .min(3)
          .max(6)
          .describe("3-6 条纪事，每条 30-80 字"),
      });

      let result = await llm.generateObject(prompt, DailySummarySchema, systemPrompt);

      // H1: Lint chronicle entries with era pack forbidden concepts
      if (world.eraPack) {
        const fullText = result.entries.join(" ");
        const lint = lintEraOutput(fullText, world.eraPack);
        if (!lint.ok) {
          console.warn(`[Lint] Chronicle entries violate forbidden concepts: ${lint.violations.join(", ")}`);
          // Retry once
          result = await llm.generateObject(
            prompt + buildRetrySuffix(lint.violations),
            DailySummarySchema,
            systemPrompt
          );
        }
      }

      // Combine entries into description
      const description = result.entries.join("\n\n");

      const { year, season, day } = this.getGameDate(world.tickCount);

      await this.repo.create({
        worldId: world.id,
        tick: world.tickCount,
        year,
        season,
        day,
        type: "daily_summary" as ChronicleType,
        title: `第 ${dayNumber} 日纪事`,
        description,
        importance: 0.6,
        metadata: {
          dayNumber,
          entryCount: result.entries.length,
        },
      });

      console.log(`[Chronicle] Daily summary generated for day ${dayNumber}`);
    } catch (error) {
      console.error("[Chronicle] Failed to generate daily summary:", error);
    }
  }
}

// Global instance
export const chronicleEngine = new ChronicleEngine();
