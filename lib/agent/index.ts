import { World } from "./world";
import { EraPack } from "@/lib/era-pack/loader";

// Global world instance
let currentWorld: World | null = null;

export function createWorld(
  id: string,
  name: string,
  width: number = 800,
  height: number = 600,
  eraPack: EraPack | null = null
): World {
  currentWorld = new World(id, name, width, height, eraPack);
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
