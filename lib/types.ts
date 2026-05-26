// ============ Core Types ============

export type Position = {
  x: number;
  y: number;
};

export type AgentStatus = "alive" | "sick" | "dead";

export type AgentIdentity = {
  name: string;
  age: number;
  gender: string;
  occupation: string;
  personality: {
    traits: string[];
    values: string[];
    quirks: string[];
  };
  backstory: string;
  appearance: {
    description: string;
    hairColor: string;
    skinTone: string;
    distinguishingFeatures: string[];
  };
  initialGoals: string[];
};

export type AgentState = {
  id: string;
  name: string;
  position: Position;
  currentActivity: string;
  energy: number;
  mood: number;
  stress: number;
  status: AgentStatus;
};

// ============ Time Types ============

export type TimeState = {
  realtimeSeconds: number;
  gameMinutes: number;
  tickCount: number;
};

export type Calendar = {
  daysPerMonth: number[];
  monthNames: string[];
  weekdayNames: string[];
  yearLabel: (year: number) => string;
  isHoliday?: (day: number, month: number, year: number) => string | null;
};

// ============ Memory Types ============

export type MemoryType = "observation" | "event" | "dialogue" | "reflection" | "plan";

export type Memory = {
  id: string;
  type: MemoryType;
  content: string;
  importance: number;
  tick: number;
  relatedAgentIds: string[];
};

// ============ Building Types ============

export type BuildingType =
  | "cottage"
  | "farmhouse"
  | "smithy"
  | "tavern"
  | "shop"
  | "school"
  | "church"
  | "clinic"
  | "social"
  | "commercial"
  | "religious"
  | "crafting";

export type Building = {
  id: string;
  type: BuildingType;
  name: string;
  position: Position;
  width: number;
  height: number;
  ownerId?: string;
  size?: { width: number; height: number };
  description?: string;
};

// ============ Era Pack Types ============

export type EraPack = {
  id: string;
  name: string;
  yearStart: number;
  calendar: string;
  worldPrompt: string;
  occupations: { id: string; name: string; workplace: string }[];
  buildingTypes: { id: string; name: string; visual: string }[];
  clothingPalette: {
    male: string[];
    female: string[];
    forbidden: string[];
  };
  dialogueStyle: string;
  forbiddenConcepts: string[];
};

// ============ World Types ============

export type WorldEventType = "weather" | "festival" | "disaster" | "arrival" | "intervention";

export type WorldEvent = {
  id: string;
  type: WorldEventType;
  tick: number;
  description: string;
  witnessIds: string[];
};

// ============ Simulation Types ============

export type GameSpeed = 0 | 1 | 4 | 16 | 64;

export type SimulationConfig = {
  tickRateHz: number;
  gameMinutesPerTick: number;
  speed: GameSpeed;
};

// ============ Agent Action Types ============

export type ActionType = "move" | "interact" | "talk" | "rest" | "work";

export type Action = {
  type: ActionType;
  targetId?: string;
  description: string;
};
