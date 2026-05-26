"use client";

import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";

interface WorldViewProps {
  width?: number;
  height?: number;
  tileSize?: number;
}

// Mock agents and buildings for Phase 1
const MOCK_AGENTS = [
  { id: "1", name: "张三", x: 10, y: 15, color: 0xff6b6b },
  { id: "2", name: "李四", x: 25, y: 20, color: 0x4ecdc4 },
  { id: "3", name: "王五", x: 35, y: 10, color: 0x45b7d1 },
];

const MOCK_BUILDINGS = [
  { id: "b1", name: "酒馆", x: 20, y: 12, w: 4, h: 3, color: 0x8b4513 },
  { id: "b2", name: "铁匠铺", x: 8, y: 8, w: 3, h: 3, color: 0x696969 },
  { id: "b3", name: "民居", x: 30, y: 18, w: 3, h: 2, color: 0xdeb887 },
  { id: "b4", name: "市集", x: 15, y: 25, w: 5, h: 4, color: 0xdaa520 },
];

export function WorldView({ width = 800, height = 600, tileSize = 10 }: WorldViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const agentsContainerRef = useRef<PIXI.Container | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize PixiJS Application
    const app = new PIXI.Application({
      width,
      height,
      backgroundColor: 0x2d5016, // Dark green grass
      antialias: false,
      resolution: window.devicePixelRatio || 1,
    });

    containerRef.current.appendChild(app.view as HTMLCanvasElement);
    appRef.current = app;

    // Create ground texture (simple grass pattern)
    const ground = new PIXI.Graphics();
    for (let x = 0; x < width; x += tileSize) {
      for (let y = 0; y < height; y += tileSize) {
        // Slight color variation for grass
        const variation = Math.random() * 0x101010;
        const color = 0x2d5016 + variation;
        ground.beginFill(color);
        ground.drawRect(x, y, tileSize, tileSize);
        ground.endFill();
      }
    }
    app.stage.addChild(ground);

    // Create buildings
    const buildingsContainer = new PIXI.Container();
    MOCK_BUILDINGS.forEach((building) => {
      const g = new PIXI.Graphics();
      g.beginFill(building.color);
      g.drawRect(building.x * tileSize, building.y * tileSize, building.w * tileSize, building.h * tileSize);
      g.endFill();

      // Add border
      g.lineStyle(2, 0x000000, 0.5);
      g.drawRect(building.x * tileSize, building.y * tileSize, building.w * tileSize, building.h * tileSize);

      // Add label
      const text = new PIXI.Text(building.name, {
        fontSize: 10,
        fill: 0xffffff,
        fontFamily: "sans-serif",
      });
      text.position.set(building.x * tileSize + 2, building.y * tileSize + building.h * tileSize / 2 - 5);
      g.addChild(text);

      buildingsContainer.addChild(g);
    });
    app.stage.addChild(buildingsContainer);

    // Create agents container
    const agentsContainer = new PIXI.Container();
    agentsContainerRef.current = agentsContainer;

    MOCK_AGENTS.forEach((agent) => {
      const g = new PIXI.Graphics();

      // Draw agent as a circle
      g.beginFill(agent.color);
      g.drawCircle(0, 0, 6);
      g.endFill();

      // Add border
      g.lineStyle(2, 0x000000, 0.7);
      g.drawCircle(0, 0, 6);

      // Add name label
      const text = new PIXI.Text(agent.name, {
        fontSize: 9,
        fill: 0xffffff,
        fontFamily: "sans-serif",
        stroke: 0x000000,
        strokeThickness: 2,
      });
      text.anchor.set(0.5, 1);
      text.position.set(0, -10);
      g.addChild(text);

      g.position.set(agent.x * tileSize, agent.y * tileSize);
      g.eventMode = "static";
      g.cursor = "pointer";

      agentsContainer.addChild(g);
    });

    app.stage.addChild(agentsContainer);

    // Simple animation loop - random movement
    let tick = 0;
    app.ticker.add(() => {
      tick++;
      if (tick % 60 === 0) {
        // Every ~1 second, move agents randomly
        agentsContainer.children.forEach((child, index) => {
          const agent = MOCK_AGENTS[index];
          if (agent) {
            const dx = (Math.random() - 0.5) * 2;
            const dy = (Math.random() - 0.5) * 2;
            child.x = Math.max(10, Math.min(width - 10, child.x + dx * tileSize));
            child.y = Math.max(10, Math.min(height - 10, child.y + dy * tileSize));
          }
        });
      }
    });

    return () => {
      app.destroy(true);
      if (containerRef.current && app.view) {
        containerRef.current.removeChild(app.view as HTMLCanvasElement);
      }
    };
  }, [width, height, tileSize]);

  return (
    <div
      ref={containerRef}
      className="relative rounded-lg overflow-hidden border border-border shadow-lg"
      style={{ width, height }}
    />
  );
}
