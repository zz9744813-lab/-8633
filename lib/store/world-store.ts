import { create } from "zustand";
import { Building } from "@/lib/types";

interface AgentData {
  id: string;
  identity: { name: string; age: number; occupation: string; familyName?: string };
  state: { position: { x: number; y: number }; currentActivity: string; energy: number; mood: number; money?: number; inventory?: Record<string, number> };
  dailyPlan?: { morningThought: string; steps: { time: string; description: string }[] } | null;
}

interface WorldState {
  id: string | null;
  name: string | null;
  tick: number;
  speed: number;
  paused: boolean;
  agents: AgentData[];
  buildings: Building[];
  connected: boolean;

  setWorld: (world: {
    id: string;
    name: string;
    tick: number;
    speed: number;
    paused: boolean;
    agents: AgentData[];
    buildings: Building[];
  }) => void;

  updateWorld: (world: {
    tick: number;
    speed: number;
    paused: boolean;
    agents: AgentData[];
  }) => void;

  setConnected: (connected: boolean) => void;
  clearWorld: () => void;
}

export const useWorldStore = create<WorldState>((set) => ({
  id: null,
  name: null,
  tick: 0,
  speed: 1,
  paused: false,
  agents: [],
  buildings: [],
  connected: false,

  setWorld: (world) =>
    set({
      id: world.id,
      name: world.name,
      tick: world.tick,
      speed: world.speed,
      paused: world.paused,
      agents: world.agents,
      buildings: world.buildings,
    }),

  updateWorld: (world) =>
    set({
      tick: world.tick,
      speed: world.speed,
      paused: world.paused,
      agents: world.agents,
    }),

  setConnected: (connected) => set({ connected }),

  clearWorld: () =>
    set({
      id: null,
      name: null,
      tick: 0,
      speed: 1,
      paused: false,
      agents: [],
      buildings: [],
      connected: false,
    }),
}));
