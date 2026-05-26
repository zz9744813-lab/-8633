import { ChronicleRepository, chronicleRepo, ChronicleType } from "@/db/chronicle-repository";
import { World } from "@/lib/agent/world";
import { Agent } from "@/lib/agent/agent";

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
}

// Global instance
export const chronicleEngine = new ChronicleEngine();
