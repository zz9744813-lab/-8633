// Sprite generation utilities for pixel-art style agents
// Generates procedurally colored pixel characters

interface SpriteColors {
  skin: string;
  hair: string;
  clothes: string;
  pants: string;
}

interface AgentSpriteConfig {
  name: string;
  occupation: string;
  seed: number; // Used for consistent randomization
  gender?: "male" | "female";
}

// Generate deterministic colors from seed
function generateColorsFromSeed(seed: number): SpriteColors {
  const hue = (seed * 137.5) % 360;
  const sat = 50 + (seed * 7) % 30;
  const light = 40 + (seed * 11) % 20;

  return {
    skin: `hsl(${30 + (seed * 3) % 20}, ${70}%, ${60 + (seed * 2) % 15}%)`,
    hair: `hsl(${hue}, ${sat}%, ${30 + (seed % 20)}%)`,
    clothes: `hsl(${(hue + 180) % 360}, ${sat}%, ${light}%)`,
    pants: `hsl(${hue}, ${sat - 20}%, ${light - 10}%)`,
  };
}

// Generate a simple 16x16 pixel character as data URL
export function generateAgentSprite(config: AgentSpriteConfig): string {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 24;
  const ctx = canvas.getContext("2d")!;

  const colors = generateColorsFromSeed(config.seed);
  const isFemale = config.gender === "female";

  // Clear
  ctx.clearRect(0, 0, 16, 24);

  // Draw legs
  ctx.fillStyle = colors.pants;
  ctx.fillRect(5, 16, 2, 8); // Left leg
  ctx.fillRect(9, 16, 2, 8); // Right leg

  // Draw body
  ctx.fillStyle = colors.clothes;
  ctx.fillRect(4, 10, 8, 8); // Torso

  // Draw arms
  ctx.fillStyle = colors.skin;
  ctx.fillRect(2, 11, 2, 5); // Left arm
  ctx.fillRect(12, 11, 2, 5); // Right arm

  // Draw head
  ctx.fillStyle = colors.skin;
  ctx.fillRect(5, 4, 6, 6); // Face

  // Draw hair
  ctx.fillStyle = colors.hair;
  if (isFemale) {
    // Longer hair for female
    ctx.fillRect(4, 2, 8, 3); // Top
    ctx.fillRect(3, 3, 2, 6); // Left side
    ctx.fillRect(11, 3, 2, 6); // Right side
  } else {
    // Shorter hair for male
    ctx.fillRect(4, 2, 8, 3); // Top
    ctx.fillRect(4, 3, 1, 3); // Left side
    ctx.fillRect(11, 3, 1, 3); // Right side
  }

  // Draw eyes
  ctx.fillStyle = "#000";
  ctx.fillRect(6, 6, 1, 1);
  ctx.fillRect(9, 6, 1, 1);

  return canvas.toDataURL("image/png");
}

// Generate a 64x64 portrait for dialogue UI
export function generateAgentPortrait(config: AgentSpriteConfig): string {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;

  const colors = generateColorsFromSeed(config.seed);
  const isFemale = config.gender === "female";

  // Clear with background
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(0, 0, 64, 64);

  // Scale up the 16x24 sprite
  const scale = 2.5;
  const offsetX = 16;
  const offsetY = 8;

  // Helper to draw scaled pixel
  const drawPixel = (x: number, y: number, color: string, size: number = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(
      offsetX + x * scale,
      offsetY + y * scale,
      size * scale,
      size * scale
    );
  };

  // Draw legs
  for (let y = 16; y < 24; y++) {
    for (let x = 5; x < 7; x++) drawPixel(x, y, colors.pants);
    for (let x = 9; x < 11; x++) drawPixel(x, y, colors.pants);
  }

  // Draw body
  for (let y = 10; y < 18; y++) {
    for (let x = 4; x < 12; x++) drawPixel(x, y, colors.clothes);
  }

  // Draw arms
  for (let y = 11; y < 16; y++) {
    for (let x = 2; x < 4; x++) drawPixel(x, y, colors.skin);
    for (let x = 12; x < 14; x++) drawPixel(x, y, colors.skin);
  }

  // Draw head
  for (let y = 4; y < 10; y++) {
    for (let x = 5; x < 11; x++) drawPixel(x, y, colors.skin);
  }

  // Draw hair
  if (isFemale) {
    for (let x = 4; x < 12; x++) drawPixel(x, 2, colors.hair);
    for (let x = 4; x < 12; x++) drawPixel(x, 3, colors.hair);
    for (let y = 3; y < 9; y++) drawPixel(3, y, colors.hair);
    for (let y = 3; y < 9; y++) drawPixel(11, y, colors.hair);
  } else {
    for (let x = 4; x < 12; x++) drawPixel(x, 2, colors.hair);
    for (let x = 4; x < 12; x++) drawPixel(x, 3, colors.hair);
    drawPixel(4, 4, colors.hair);
    drawPixel(4, 5, colors.hair);
    drawPixel(11, 4, colors.hair);
    drawPixel(11, 5, colors.hair);
  }

  // Draw eyes
  drawPixel(6, 6, "#000");
  drawPixel(9, 6, "#000");

  return canvas.toDataURL("image/png");
}

// Generate building sprite based on type
export function generateBuildingSprite(type: string, name: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;

  const colors: Record<string, { main: string; roof: string; detail: string }> = {
    house: { main: "#8B4513", roof: "#654321", detail: "#A0522D" },
    shop: { main: "#D2691E", roof: "#8B4513", detail: "#F4A460" },
    tavern: { main: "#556B2F", roof: "#3D4A1E", detail: "#6B8E23" },
    church: { main: "#708090", roof: "#2F4F4F", detail: "#A9A9A9" },
    blacksmith: { main: "#2F2F2F", roof: "#1A1A1A", detail: "#4A4A4A" },
    market: { main: "#DAA520", roof: "#B8860B", detail: "#FFD700" },
    default: { main: "#808080", roof: "#606060", detail: "#A0A0A0" },
  };

  const color = colors[type.toLowerCase()] || colors.default;

  // Clear
  ctx.clearRect(0, 0, 32, 32);

  // Draw main building
  ctx.fillStyle = color.main;
  ctx.fillRect(4, 12, 24, 20);

  // Draw roof
  ctx.fillStyle = color.roof;
  ctx.beginPath();
  ctx.moveTo(2, 12);
  ctx.lineTo(16, 2);
  ctx.lineTo(30, 12);
  ctx.closePath();
  ctx.fill();

  // Draw door
  ctx.fillStyle = color.detail;
  ctx.fillRect(13, 20, 6, 12);

  // Draw window
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(7, 16, 4, 4);
  ctx.fillRect(21, 16, 4, 4);

  return canvas.toDataURL("image/png");
}

// Generate a 4-frame walk animation spritesheet (64x24)
export function generateWalkSheet(config: AgentSpriteConfig): string {
  const frameCount = 4;
  const canvas = document.createElement("canvas");
  canvas.width = 16 * frameCount;
  canvas.height = 24;
  const ctx = canvas.getContext("2d")!;
  const colors = generateColorsFromSeed(config.seed);
  const isFemale = config.gender === "female";

  for (let i = 0; i < frameCount; i++) {
    const ox = i * 16;

    // Leg offset for walk cycle
    const legOffset = [0, 2, 0, -2][i];

    // Legs
    ctx.fillStyle = colors.pants;
    ctx.fillRect(ox + 5 + legOffset, 16, 2, 8);
    ctx.fillRect(ox + 9 - legOffset, 16, 2, 8);

    // Body
    ctx.fillStyle = colors.clothes;
    ctx.fillRect(ox + 4, 10, 8, 8);

    // Arms
    const armSway = [0, 1, 0, -1][i];
    ctx.fillStyle = colors.skin;
    ctx.fillRect(ox + 2 + armSway, 11, 2, 5);
    ctx.fillRect(ox + 12 - armSway, 11, 2, 5);

    // Head
    ctx.fillStyle = colors.skin;
    ctx.fillRect(ox + 5, 4, 6, 6);

    // Hair
    ctx.fillStyle = colors.hair;
    if (isFemale) {
      ctx.fillRect(ox + 4, 2, 8, 3);
      ctx.fillRect(ox + 3, 3, 2, 6);
      ctx.fillRect(ox + 11, 3, 2, 6);
    } else {
      ctx.fillRect(ox + 4, 2, 8, 3);
      ctx.fillRect(ox + 4, 3, 1, 3);
      ctx.fillRect(ox + 11, 3, 1, 3);
    }

    // Eyes
    ctx.fillStyle = "#000";
    ctx.fillRect(ox + 6, 6, 1, 1);
    ctx.fillRect(ox + 9, 6, 1, 1);
  }

  return canvas.toDataURL("image/png");
}

// Cache for generated sprites
const spriteCache = new Map<string, string>();

export function getCachedSprite(key: string, generator: () => string): string {
  if (!spriteCache.has(key)) {
    spriteCache.set(key, generator());
  }
  return spriteCache.get(key)!;
}

export function clearSpriteCache(): void {
  spriteCache.clear();
}

// I1: Generate AI portrait via fal.ai
import * as fal from "@fal-ai/serverless-client";
import type { EraPack } from "@/lib/types";

// ... existing code ...

export async function generatePortrait(
  name: string,
  occupation: string,
  gender: string,
  apiKey: string,
  eraName?: string,
  appearance?: { description?: string; hairColor?: string; skinTone?: string; distinguishingFeatures?: string[] },
  eraPack?: EraPack | null
): Promise<string | null> {
  if (!apiKey) return null;

  const clothingDesc = eraPack?.clothingPalette?.[gender === "female" ? "female" : "male"]?.join(", ");
  const clothingPart = clothingDesc ? `wearing ${clothingDesc}, ` : "";

  const prompt = `pixel art portrait, head and shoulders, retro game character style, 
${occupation}, ${gender}, named ${name},
${appearance?.description ? appearance.description + ", " : ""}
${appearance?.hairColor ? appearance.hairColor + " hair, " : ""}
${appearance?.skinTone ? appearance.skinTone + " skin, " : ""}
${clothingPart}
${eraName ? eraName + " era clothing, " : "fantasy setting, "}
sharp pixels, 8-bit style, limited color palette, simple solid background,
no text, no logo, game sprite portrait view, highly pixelated`;

  try {
    fal.config({ credentials: apiKey });
    const result = await fal.subscribe("fal-ai/flux/schnell", {
      input: {
        prompt,
        image_size: "square_hd",
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
      },
    }) as any;
    return result?.images?.[0]?.url ?? result?.output?.images?.[0]?.url ?? null;
  } catch (e) {
    console.warn("[Portrait] fal.ai API failed:", e);
    return null;
  }
}
