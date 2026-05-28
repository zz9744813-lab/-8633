import { World } from "./world";
import { EraPack } from "@/lib/era-pack/loader";
import { worldRepository } from "@/db/world-repository";

// T2.2: Use globalThis to prevent duplicate instances on hot reload
const g = globalThis as any;

// Global world instance - cached on globalThis
let currentWorld: World | null = g.__ptCurrentWorld ?? null;
const worldRegistry: Map<string, World> = g.__ptWorldRegistry ?? new Map<string, World>();

// Sync with globalThis
g.__ptCurrentWorld = currentWorld;
g.__ptWorldRegistry = worldRegistry;

export function createWorld(
  id: string,
  name: string,
  width: number = 800,
  height: number = 600,
  eraPack: EraPack | null = null
): World {
  destroyCurrentWorld();
  currentWorld = new World(id, name, width, height, eraPack);
  worldRegistry.set(id, currentWorld);
  return currentWorld;
}

import { usageTracker } from "@/lib/llm/usage-tracker";

export async function createWorldOrLoad(
  id: string,
  name: string,
  width: number = 800,
  height: number = 600,
  eraPack: EraPack | null = null
): Promise<World> {
  await usageTracker.initialize();

  // If already in registry and loaded, just switch
  if (worldRegistry.has(id)) {
    currentWorld = worldRegistry.get(id)!;
    return currentWorld;
  }

  // Try to load existing world from DB
  const existing = await worldRepository.loadWorld(id);
  if (existing) {
    console.log("[World] Loading existing world:", id);
    const world = await worldRepository.reconstructWorld(existing);
    destroyCurrentWorld();
    currentWorld = world;
    worldRegistry.set(id, world);
    return world;
  }

  // Create new world
  console.log("[World] Creating new world:", id);
  destroyCurrentWorld();
  currentWorld = new World(id, name, width, height, eraPack);
  worldRegistry.set(id, currentWorld);
  return currentWorld;
}

export function getWorld(): World | null {
  return currentWorld;
}

export function setWorld(world: World): void {
  currentWorld?.stop();
  currentWorld = world;
  worldRegistry.set(world.id, world);
}

export async function switchWorld(id: string): Promise<World | null> {
  // Save current world first
  if (currentWorld) {
    currentWorld.stop();
    try { await worldRepository.saveWorld(currentWorld); } catch (e) {
      console.error("[World] Failed to save current world:", e);
    }
  }

  // Load target world
  const loaded = await createWorldOrLoad(id, "", 800, 600);
  if (loaded) {
    loaded.start();
  }
  return loaded;
}

export function destroyCurrentWorld(): void {
  if (currentWorld) {
    currentWorld.stop();
    worldRegistry.delete(currentWorld.id);
    currentWorld = null;
  }
}

export function destroyWorld(): void {
  destroyCurrentWorld();
}
