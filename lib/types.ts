// ============ Core Types ============

export type Position = {
  x: number;
  y: number;
  dir?: string; // "down" | "up" | "left" | "right"
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
  familyName?: string;
  parentIds?: string[];
  childIds?: string[];
  spouseId?: string;
  portraitUrl?: string;
};

export type AgentState = {
  id: string;
  name: string;
  position: Position;
  currentActivity: string;
  energy: number;
  mood: number;
  stress: number;
  health: number;
  status: AgentStatus;
  targetPosition?: Position | null;
  insideBuildingId?: string | null;
  currentGoals?: string[]; // F2: Long-term goals
  skills?: Record<string, number>; // G3: skill name → 0-100
  pregnantSince?: number; // G2: tick when pregnancy started
  illness?: {
    name: string;
    severity: number;
    startTick: number;
    estimatedDuration: number;
  };
  deathTick?: number;
  isMoving?: boolean;
  walkFrame?: number;
  money?: number;
  inventory?: Record<string, number>; // itemId → quantity
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
  type: string;
  content: string;
  importance: number;
  tick: number;
  relatedAgentIds?: string[];
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
  description?: string;
  economy?: BuildingEconomy;
};

export type BuildingEconomy = {
  inventory: Record<string, number>; // itemId → stock
  prices: Record<string, number>; // itemId → base price
  wage: number; // daily wage for workers
  lastRestockTick: number;
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

export type ActionType =
  | "MOVE_TO"
  | "ENTER"
  | "WORK"
  | "EAT"
  | "SLEEP"
  | "INTERACT"
  | "USE"
  | "WAIT"
  | "SAY"
  | "BUY"
  | "SELL";

export type Action = {
  type: ActionType;
  targetId?: string;
  description: string;
  reason?: string;
};
