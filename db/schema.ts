import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

// ============ Worlds ============
export const worlds = sqliteTable("worlds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  eraPackId: text("era_pack_id"),
  seed: integer("seed").notNull().default(0),
  currentTick: integer("current_tick").default(0),
  tickCount: integer("tick_count").default(0),
  yearOffset: integer("year_offset").default(0),
  // World dimensions
  width: integer("width").notNull().default(100),
  height: integer("height").notNull().default(100),
  // Simulation state
  speed: integer("speed").default(1),
  paused: integer("paused", { mode: "boolean" }).default(false),
  config: text("config", { mode: "json" }).$type<WorldConfig>(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
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

  // Basic info
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

  // Serialized identity/state for persistence
  identity: text("identity", { mode: "json" }),
  state: text("state", { mode: "json" }),
  dailyPlan: text("daily_plan", { mode: "json" }),
  lastPlanTick: integer("last_plan_tick").default(0),

  // Position (denormalized for easy access)
  positionX: real("position_x").default(0),
  positionY: real("position_y").default(0),

  // Visual
  spriteUrl: text("sprite_url"),
  portraitUrl: text("portrait_url"),
  paletteHash: text("palette_hash"),

  // State (denormalized for easy queries)
  homeId: text("home_id"),
  workplaceId: text("workplace_id"),
  x: real("x"),
  y: real("y"),
  status: text("status").default("alive"), // alive/sick/dead

  // Bookkeeping
  bornTick: integer("born_tick"),
  diedTick: integer("died_tick"),

  // Current state (denormalized)
  currentActivity: text("current_activity").default("idle"),
  currentGoals: text("current_goals", { mode: "json" }).$type<string[]>(),
  energy: real("energy").default(70),
  mood: real("mood").default(50),
  stress: real("stress").default(30),

  // Timestamps
  updatedAt: integer("updated_at", { mode: "timestamp" }),
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
  width: integer("width").default(1),
  height: integer("height").default(1),
  position: text("position", { mode: "json" }), // {x, y}
  description: text("description"),
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

// ============ Chronicles ============
export const chronicles = sqliteTable("chronicles", {
  id: text("id").primaryKey(),
  worldId: text("world_id").references(() => worlds.id).notNull(),
  tick: integer("tick").notNull(),
  year: integer("year").notNull(),
  season: text("season").notNull(), // spring/summer/autumn/winter
  day: integer("day").notNull(),
  type: text("type").notNull(), // birth/death/building/war/marriage/disaster/milestone
  title: text("title").notNull(),
  description: text("description").notNull(),
  agentIds: text("agent_ids", { mode: "json" }).$type<string[]>(),
  buildingIds: text("building_ids", { mode: "json" }).$type<string[]>(),
  importance: real("importance").default(0.5), // 0-1, affects display prominence
  metadata: text("metadata", { mode: "json" }), // extra context
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// ============ Rumors ============
export const rumors = sqliteTable("rumors", {
  id: text("id").primaryKey(),
  worldId: text("world_id").references(() => worlds.id).notNull(),
  originatorId: text("originator_id").references(() => agents.id),
  tick: integer("tick").notNull(),
  type: text("type").notNull(), // scandal/secret/event/relationship/achievement/danger
  subject: text("subject").notNull(), // who/what is the rumor about
  content: text("content").notNull(), // the rumor text
  truthLevel: real("truth_level").default(0.5), // 0-1
  spreadCount: integer("spread_count").default(0),
  knownByIds: text("known_by_ids", { mode: "json" }).$type<string[]>().default([]),
  sourceMemoryId: text("source_memory_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const rumorsRelations = relations(rumors, ({ one }) => ({
  world: one(worlds, { fields: [rumors.worldId], references: [worlds.id] }),
  originator: one(agents, { fields: [rumors.originatorId], references: [agents.id] }),
}));

export const chroniclesRelations = relations(chronicles, ({ one }) => ({
  world: one(worlds, { fields: [chronicles.worldId], references: [worlds.id] }),
}));

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

// ============ Reflections ============
export const reflections = sqliteTable("reflections", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").references(() => agents.id).notNull(),
  content: text("content").notNull(),
  patternType: text("pattern_type"), // behavior_preference/social_dynamic/goal_progress
  sourceMemoryIds: text("source_memory_ids", { mode: "json" }).$type<string[]>(),
  createdTick: integer("created_tick").notNull(),
  lastAccessedTick: integer("last_accessed_tick"),
  importance: real("importance").default(0.8),
});
