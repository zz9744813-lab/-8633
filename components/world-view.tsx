"use client";

import { useEffect, useRef, useCallback } from "react";
import * as PIXI from "pixi.js";
import {
  generateAgentSprite,
  generateAgentPortrait,
  generateBuildingSprite,
  getCachedSprite,
} from "@/lib/sprite-generator";

interface AgentData {
  id: string;
  x: number;
  y: number;
  name: string;
  occupation: string;
  currentActivity: string;
}

interface BuildingData {
  id: string;
  x: number;
  y: number;
  name: string;
  type: string;
  width: number;
  height: number;
}

interface WorldViewProps {
  width?: number;
  height?: number;
  tileSize?: number;
  agents?: AgentData[];
  buildings?: BuildingData[];
  gameTime?: { hour: number; minute: number }; // 0-23 hours
  onAgentClick?: (agent: AgentData) => void;
}

// Time-based colors for day/night cycle
function getTimeOfDayColors(hour: number): {
  sky: number;
  ground: number;
  ambient: number;
  lightLevel: number;
} {
  // Dawn: 5-7, Day: 7-17, Dusk: 17-19, Night: 19-5
  if (hour >= 5 && hour < 7) {
    // Dawn
    const t = (hour - 5) / 2;
    return {
      sky: interpolateColor(0x1a1a2e, 0x87ceeb, t),
      ground: interpolateColor(0x1a2a1a, 0x2d5016, t),
      ambient: 0.3 + t * 0.4,
      lightLevel: 0.4 + t * 0.4,
    };
  } else if (hour >= 7 && hour < 17) {
    // Day
    return {
      sky: 0x87ceeb,
      ground: 0x2d5016,
      ambient: 1.0,
      lightLevel: 1.0,
    };
  } else if (hour >= 17 && hour < 19) {
    // Dusk
    const t = (hour - 17) / 2;
    return {
      sky: interpolateColor(0x87ceeb, 0x2d1b4e, t),
      ground: interpolateColor(0x2d5016, 0x1a2a1a, t),
      ambient: 1.0 - t * 0.5,
      lightLevel: 1.0 - t * 0.6,
    };
  } else {
    // Night
    return {
      sky: 0x0a0a1a,
      ground: 0x151a15,
      ambient: 0.2,
      lightLevel: 0.15,
    };
  }
}

function interpolateColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (g << 8) | b;
}

export function WorldView({
  width = 800,
  height = 600,
  tileSize = 10,
  agents = [],
  buildings = [],
  gameTime = { hour: 12, minute: 0 },
  onAgentClick,
}: WorldViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const agentsContainerRef = useRef<PIXI.Container | null>(null);
  const buildingsContainerRef = useRef<PIXI.Container | null>(null);
  const groundRef = useRef<PIXI.Graphics | null>(null);
  const overlayRef = useRef<PIXI.Graphics | null>(null);
  const agentSpritesRef = useRef<Map<string, PIXI.Container>>(new Map());
  const buildingSpritesRef = useRef<Map<string, PIXI.Container>>(new Map());
  const timeRef = useRef(gameTime);

  // Keep time ref updated
  useEffect(() => {
    timeRef.current = gameTime;
  }, [gameTime]);

  // Initialize PixiJS
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let app: PIXI.Application | null = null;

    (async () => {
      app = new PIXI.Application();
      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
      });

      if (cancelled) {
        app.destroy(true);
        return;
      }

      containerRef.current!.appendChild(app.canvas);
      appRef.current = app;

      // Create ground
      const ground = new PIXI.Graphics();
      groundRef.current = ground;
      app.stage.addChild(ground);

      // Create buildings container
      const buildingsContainer = new PIXI.Container();
      buildingsContainerRef.current = buildingsContainer;
      app.stage.addChild(buildingsContainer);

      // Create agents container
      const agentsContainer = new PIXI.Container();
      agentsContainerRef.current = agentsContainer;
      app.stage.addChild(agentsContainer);

      // Create night overlay
      const overlay = new PIXI.Graphics();
      overlayRef.current = overlay;
      app.stage.addChild(overlay);

      // Initial render
      updateVisuals();
    })();

    function updateVisuals() {
      if (!groundRef.current || !overlayRef.current) return;

      const colors = getTimeOfDayColors(timeRef.current.hour);

      // Update ground
      const ground = groundRef.current;
      ground.clear();
      for (let x = 0; x < width; x += tileSize) {
        for (let y = 0; y < height; y += tileSize) {
          const variation = Math.random() * 0x080808;
          const baseColor = colors.ground;
          const color = baseColor + variation;
          ground.rect(x, y, tileSize, tileSize);
          ground.fill(color);
        }
      }

      // Update overlay (night darkness)
      const overlay = overlayRef.current;
      overlay.clear();
      const darkness = 1 - colors.lightLevel;
      if (darkness > 0) {
        overlay.rect(0, 0, width, height);
        overlay.fill({ color: 0x000020, alpha: darkness * 0.6 });
      }

      // Tint buildings based on time
      buildingsContainerRef.current?.children.forEach((child) => {
        (child as PIXI.Container).alpha = colors.ambient;
      });

      // Tint agents based on time
      agentsContainerRef.current?.children.forEach((child) => {
        (child as PIXI.Container).alpha = colors.ambient;
      });
    }

    // Update visuals periodically
    const interval = setInterval(updateVisuals, 1000);

    return () => {
      clearInterval(interval);
      cancelled = true;
      if (app) {
        app.canvas.parentNode?.removeChild(app.canvas);
        app.destroy(true);
      }
    };
  }, [width, height, tileSize]);

  // Update buildings
  useEffect(() => {
    const container = buildingsContainerRef.current;
    if (!container) return;

    const sprites = buildingSpritesRef.current;

    buildings.forEach((building) => {
      let sprite = sprites.get(building.id);

      if (!sprite) {
        sprite = new PIXI.Container();

        // Generate building sprite
        const spriteUrl = getCachedSprite(
          `building-${building.type}-${building.name}`,
          () => generateBuildingSprite(building.type, building.name)
        );

        // Create sprite from data URL
        const texture = PIXI.Texture.from(spriteUrl);
        const buildingSprite = new PIXI.Sprite(texture);
        buildingSprite.anchor.set(0.5);
        buildingSprite.scale.set(2);
        sprite.addChild(buildingSprite);

        // Add label
        const text = new PIXI.Text({
          text: building.name,
          style: {
            fontSize: 11,
            fill: 0xffffff,
            fontFamily: "sans-serif",
            stroke: { color: 0x000000, width: 3 },
            dropShadow: true,
            dropShadowColor: 0x000000,
            dropShadowDistance: 1,
          },
        });
        text.anchor.set(0.5, 1);
        text.position.set(0, -20);
        sprite.addChild(text);

        container.addChild(sprite);
        sprites.set(building.id, sprite);
      }

      // Update position
      sprite.x = building.x + building.width / 2;
      sprite.y = building.y + building.height / 2;
    });

    // Remove unused sprites
    sprites.forEach((sprite, id) => {
      if (!buildings.find((b) => b.id === id)) {
        container.removeChild(sprite);
        sprites.delete(id);
      }
    });
  }, [buildings]);

  // Update agents
  useEffect(() => {
    const container = agentsContainerRef.current;
    if (!container) return;

    const sprites = agentSpritesRef.current;

    agents.forEach((agent) => {
      let sprite = sprites.get(agent.id);

      if (!sprite) {
        sprite = new PIXI.Container();

        // Generate agent sprite
        const spriteUrl = getCachedSprite(`agent-${agent.id}`, () =>
          generateAgentSprite({
            name: agent.name,
            occupation: agent.occupation,
            seed: agent.name.split("").reduce((a, b) => a + b.charCodeAt(0), 0),
          })
        );

        const texture = PIXI.Texture.from(spriteUrl);
        const agentSprite = new PIXI.Sprite(texture);
        agentSprite.anchor.set(0.5, 1);
        agentSprite.scale.set(1.5);
        sprite.addChild(agentSprite);

        // Add name label
        const nameText = new PIXI.Text({
          text: agent.name,
          style: {
            fontSize: 10,
            fill: 0xffffff,
            fontFamily: "sans-serif",
            stroke: { color: 0x000000, width: 3 },
          },
        });
        nameText.anchor.set(0.5, 1);
        nameText.position.set(0, -28);
        sprite.addChild(nameText);

        // Add activity indicator
        const activityText = new PIXI.Text({
          text: agent.currentActivity,
          style: {
            fontSize: 8,
            fill: 0xffffaa,
            fontFamily: "sans-serif",
            stroke: { color: 0x000000, width: 2 },
          },
        });
        activityText.anchor.set(0.5, 0);
        activityText.position.set(0, 2);
        sprite.addChild(activityText);

        // Store reference to update activity later
        (sprite as any).activityText = activityText;

        // Make interactive
        sprite.eventMode = "static";
        sprite.cursor = "pointer";
        sprite.on("pointerdown", () => {
          onAgentClick?.(agent);
        });

        container.addChild(sprite);
        sprites.set(agent.id, sprite);
      }

      // Update position
      sprite.x = agent.x;
      sprite.y = agent.y;

      // Update activity text
      const activityText = (sprite as any).activityText as PIXI.Text;
      if (activityText && activityText.text !== agent.currentActivity) {
        activityText.text = agent.currentActivity;
      }
    });

    // Remove unused sprites
    sprites.forEach((sprite, id) => {
      if (!agents.find((a) => a.id === id)) {
        container.removeChild(sprite);
        sprites.delete(id);
      }
    });
  }, [agents, onAgentClick]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg overflow-hidden border border-border shadow-lg"
      style={{ width, height }}
    />
  );
}
