import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ============ Worlds ============
export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  eraPackId: text("era_pack_id").notNull(),
  seed: integer("seed").notNull(),
  currentTick: integer("current_tick").default(0),
  yearOffset: integer("year_offset").default(0),
  config: text("config", { mode: "json" }).$type<WorldConfig>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type WorldConfig = {
  tickRateHz: number;
  gameMinutesPerTick: number;
  speed: number;
  populationCap: number;
};

// ============ Agents ============
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  worldId: text("world_id").references(() => worlds.id).notNull(),

  // Identity
  name: text("name").notNull(),
  age: integer("age").notNull(),
  gender: text("gender"),
  occupation: text("occupation").notNull(),
  backstory: text("backstory"),
  personality: text("personality", { mode: "json" }).$type<{
    traits: string[];
    values: string[];
    quirks: string[];
  }>(),

  // Visual
  spriteUrl: text("sprite_url"),
  portraitUrl: text("portrait_url"),
  paletteHash: text("palette_hash"),

  // State
  homeId: text("home_id"),
  workplaceId: text("workplace_id"),
  x: real("x"),
  y: real("y"),
  status: text("status").default("alive"), // alive/sick/dead

  // Bookkeeping
  bornTick: integer("born_tick"),
  diedTick: integer("died_tick"),

  // Current state
  currentActivity: text("current_activity").default("idle"),
  energy: real("energy").default(70),
  mood: real("mood").default(50),
  stress: real("stress").default(30),
});

// ============ Memories ============
export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").references(() => agents.id).notNull(),
  type: text("type").notNull(), // observation/event/dialogue/reflection/plan
  content: text("content").notNull(),
  importance: real("importance").notNull(),
  tick: integer("tick").notNull(),
  lastAccessedTick: integer("last_accessed_tick"),
  embeddingId: text("embedding_id"),
  relatedAgentIds: text("related_agent_ids", { mode: "json" }).$type<string[]>(),
  locationId: text("location_id"),
});

// ============ Relationships ============
export const relationships = sqliteTable("relationships", {
  id: text("id").primaryKey(),
  fromAgentId: text("from_agent_id").references(() => agents.id).notNull(),
  toAgentId: text("to_agent_id").references(() => agents.id).notNull(),
  affinity: real("affinity").default(0),
  familiarity: real("familiarity").default(0),
  label: text("label"),
  lastInteractionTick: integer("last_interaction_tick"),
});

// ============ Buildings ============
export const buildings = sqliteTable("buildings", {
  id: text("id").primaryKey(),
  worldId: text("world_id").references(() => worlds.id).notNull(),
  type: text("type").notNull(),
  name: text("name"),
  x: integer("x"),
  y: integer("y"),
  w: integer("w"),
  h: integer("h"),
  ownerId: text("owner_id"),
  state: text("state", { mode: "json" }),
});

// ============ World Events ============
export const worldEvents = sqliteTable("world_events", {
  id: text("id").primaryKey(),
  worldId: text("world_id").references(() => worlds.id).notNull(),
  tick: integer("tick").notNull(),
  type: text("type").notNull(), // weather/festival/disaster/intervention
  payload: text("payload", { mode: "json" }),
  witnessIds: text("witness_ids", { mode: "json" }).$type<string[]>(),
  description: text("description").notNull(),
});

// ============ LLM Calls Log ============
export const llmCalls = sqliteTable("llm_calls", {
  id: text("id").primaryKey(),
  agentId: text("agent_id"),
  purpose: text("purpose"), // plan/reflect/dialogue/evaluate_importance
  model: text("model"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  costUsd: real("cost_usd"),
  durationMs: integer("duration_ms"),
  tick: integer("tick"),
});

// ============ Relations ============
export const worldsRelations = relations(worlds, ({ many }) => ({
  agents: many(agents),
  buildings: many(buildings),
  events: many(worldEvents),
}));

export const agentsRelations = relations(agents, ({ one, many }) => ({
  world: one(worlds, { fields: [agents.worldId], references: [worlds.id] }),
  memories: many(memories),
  relationships: many(relationships),
  home: one(buildings, { fields: [agents.homeId], references: [buildings.id] }),
}));
