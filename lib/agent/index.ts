import { World } from "./world";

// Global world instance
let currentWorld: World | null = null;

export function createWorld(id: string, name: string): World {
  currentWorld = new World(id, name);
  return currentWorld;
}

export function getWorld(): World | null {
  return currentWorld;
}

export function setWorld(world: World): void {
  currentWorld = world;
}

export function destroyWorld(): void {
  if (currentWorld) {
    currentWorld.stop();
    currentWorld = null;
  }
}
