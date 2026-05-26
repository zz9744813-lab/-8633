import { create } from "zustand";
import { Agent, Building } from "@/lib/types";

interface WorldState {
  id: string | null;
  name: string | null;
  tick: number;
  speed: number;
  paused: boolean;
  agents: Agent[];
  buildings: Building[];
  connected: boolean;

  setWorld: (world: {
    id: string;
    name: string;
    tick: number;
    speed: number;
    paused: boolean;
    agents: Agent[];
    buildings: Building[];
  }) => void;

  updateWorld: (world: {
    tick: number;
    speed: number;
    paused: boolean;
    agents: Agent[];
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
