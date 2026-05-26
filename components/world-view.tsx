"use client";

import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";

interface WorldViewProps {
  width?: number;
  height?: number;
  tileSize?: number;
  agents?: Array<{ x: number; y: number; name: string }>;
  buildings?: Array<{ x: number; y: number; name: string }>;
  dialogues?: Array<{ agentName: string; message: string; timestamp: number }>;
  onAgentClick?: (agent: { x: number; y: number; name: string }) => void;
}

const DEFAULT_BUILDINGS = [
  { id: "tavern", name: "酒馆", x: 200, y: 150, w: 60, h: 50, color: 0x8b4513 },
  { id: "market", name: "集市", x: 500, y: 200, w: 80, h: 60, color: 0xd4a574 },
  { id: "church", name: "教堂", x: 350, y: 400, w: 50, h: 70, color: 0x808080 },
  { id: "blacksmith", name: "铁匠铺", x: 600, y: 400, w: 50, h: 40, color: 0x4a4a4a },
];

const AGENT_COLORS = [0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf7dc6f, 0xbb8fce];

export function WorldView({
  width = 800,
  height = 600,
  tileSize = 10,
  agents = [],
  onAgentClick,
}: WorldViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const agentsContainerRef = useRef<PIXI.Container | null>(null);
  const agentSpritesRef = useRef<Map<string, PIXI.Container>>(new Map());

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let app: PIXI.Application | null = null;

    (async () => {
      app = new PIXI.Application();
      await app.init({
        width,
        height,
        backgroundColor: 0x2d5016,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
      });

      if (cancelled) {
        app.destroy(true);
        return;
      }

      containerRef.current!.appendChild(app.canvas);
      appRef.current = app;

      // Create ground texture
      const ground = new PIXI.Graphics();
      for (let x = 0; x < width; x += tileSize) {
        for (let y = 0; y < height; y += tileSize) {
          const variation = Math.random() * 0x101010;
          const color = 0x2d5016 + variation;
          ground.rect(x, y, tileSize, tileSize);
          ground.fill(color);
        }
      }
      app.stage.addChild(ground);

      // Create buildings
      const buildingsContainer = new PIXI.Container();
      DEFAULT_BUILDINGS.forEach((building) => {
        const g = new PIXI.Graphics();
        g.rect(building.x, building.y, building.w, building.h);
        g.fill(building.color);

        // Add border
        g.rect(building.x, building.y, building.w, building.h);
        g.stroke({ width: 2, color: 0x000000, alpha: 0.5 });

        // Add label
        const text = new PIXI.Text({
          text: building.name,
          style: {
            fontSize: 12,
            fill: 0xffffff,
            fontFamily: "sans-serif",
            stroke: { color: 0x000000, width: 3 },
          },
        });
        text.anchor.set(0.5);
        text.position.set(building.x + building.w / 2, building.y + building.h / 2);
        g.addChild(text);

        buildingsContainer.addChild(g);
      });
      app.stage.addChild(buildingsContainer);

      // Create agents container
      const agentsContainer = new PIXI.Container();
      agentsContainerRef.current = agentsContainer;
      app.stage.addChild(agentsContainer);
    })();

    return () => {
      cancelled = true;
      if (app) {
        app.canvas.parentNode?.removeChild(app.canvas);
        app.destroy(true);
      }
    };
  }, [width, height, tileSize]);

  // Update agents when data changes
  useEffect(() => {
    const container = agentsContainerRef.current;
    if (!container) return;

    const sprites = agentSpritesRef.current;

    // Update or create agent sprites
    agents.forEach((agent, index) => {
      let sprite = sprites.get(agent.name);

      if (!sprite) {
        // Create new agent sprite
        sprite = new PIXI.Container();

        const g = new PIXI.Graphics();
        const color = AGENT_COLORS[index % AGENT_COLORS.length];

        // Draw agent as a circle
        g.circle(0, 0, 8);
        g.fill(color);

        // Add border
        g.circle(0, 0, 8);
        g.stroke({ width: 2, color: 0x000000, alpha: 0.7 });

        // Add name label
        const text = new PIXI.Text({
          text: agent.name,
          style: {
            fontSize: 10,
            fill: 0xffffff,
            fontFamily: "sans-serif",
            stroke: { color: 0x000000, width: 3 },
          },
        });
        text.anchor.set(0.5, 1);
        text.position.set(0, -12);
        sprite.addChild(g);
        sprite.addChild(text);

        // Make interactive
        sprite.eventMode = "static";
        sprite.cursor = "pointer";
        sprite.on("pointerdown", () => {
          onAgentClick?.(agent);
        });

        container.addChild(sprite);
        sprites.set(agent.name, sprite);
      }

      // Update position
      sprite.x = agent.x;
      sprite.y = agent.y;
    });

    // Remove sprites for agents that no longer exist
    sprites.forEach((sprite, name) => {
      if (!agents.find((a) => a.name === name)) {
        container.removeChild(sprite);
        sprites.delete(name);
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
