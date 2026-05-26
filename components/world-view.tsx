"use client";

import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";
import {
  generateWalkSheet,
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
  isMoving?: boolean;
  dir?: string;
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
  gameTime?: { hour: number; minute: number };
  weather?: string;
  weatherIntensity?: number;
  season?: string;
  onAgentClick?: (agent: AgentData) => void;
}

const SEASON_TINTS: Record<string, number> = {
  spring: 0xeeffea,
  summer: 0xffffff,
  autumn: 0xffeedd,
  winter: 0xddeeff,
};

function getTimeOfDayColors(hour: number): {
  sky: number; ground: number; ambient: number; lightLevel: number;
} {
  if (hour >= 5 && hour < 7) {
    const t = (hour - 5) / 2;
    return { sky: interpolateColor(0x1a1a2e, 0x87ceeb, t), ground: interpolateColor(0x1a2a1a, 0x2d5016, t), ambient: 0.3 + t * 0.4, lightLevel: 0.4 + t * 0.4 };
  } else if (hour >= 7 && hour < 17) {
    return { sky: 0x87ceeb, ground: 0x2d5016, ambient: 1.0, lightLevel: 1.0 };
  } else if (hour >= 17 && hour < 19) {
    const t = (hour - 17) / 2;
    return { sky: interpolateColor(0x87ceeb, 0x2d1b4e, t), ground: interpolateColor(0x2d5016, 0x1a2a1a, t), ambient: 1.0 - t * 0.5, lightLevel: 1.0 - t * 0.6 };
  } else {
    return { sky: 0x0a0a1a, ground: 0x151a15, ambient: 0.2, lightLevel: 0.15 };
  }
}

function interpolateColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  return (Math.round(r1 + (r2 - r1) * t) << 16) | (Math.round(g1 + (g2 - g1) * t) << 8) | Math.round(b1 + (b2 - b1) * t);
}

function spawnRainDrop(x: number, y: number, intensity: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.rect(0, 0, 1, 2 + intensity * 4);
  g.fill({ color: 0x8ab8d4, alpha: 0.3 + intensity * 0.4 });
  g.x = x;
  g.y = y;
  return g;
}

function spawnSnowFlake(x: number, y: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.circle(0, 0, 1 + Math.random());
  g.fill({ color: 0xffffff, alpha: 0.5 + Math.random() * 0.3 });
  g.x = x;
  g.y = y;
  return g;
}

function spawnFogPatch(x: number, y: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const w = 30 + Math.random() * 60;
  const h = 10 + Math.random() * 20;
  g.ellipse(0, 0, w, h);
  g.fill({ color: 0xcccccc, alpha: 0.05 + Math.random() * 0.08 });
  g.x = x;
  g.y = y;
  return g;
}

export function WorldView({
  width = 800,
  height = 600,
  tileSize = 10,
  agents = [],
  buildings = [],
  gameTime = { hour: 12, minute: 0 },
  weather = "clear",
  weatherIntensity = 0,
  season = "spring",
  onAgentClick,
}: WorldViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const agentsContainerRef = useRef<PIXI.Container | null>(null);
  const buildingsContainerRef = useRef<PIXI.Container | null>(null);
  const groundRef = useRef<PIXI.Graphics | null>(null);
  const overlayRef = useRef<PIXI.Graphics | null>(null);
  const weatherContainerRef = useRef<PIXI.Container | null>(null);
  const agentSpritesRef = useRef<Map<string, {
    container: PIXI.Container;
    sprite: PIXI.Sprite;
    frames: PIXI.Texture[];
    activityText: PIXI.Text;
    targetX: number;
    targetY: number;
    targetMoving: boolean;
  }>>(new Map());
  const buildingSpritesRef = useRef<Map<string, PIXI.Container>>(new Map());
  const timeRef = useRef(gameTime);
  const weatherRef = useRef(weather);
  const weatherIntensityRef = useRef(weatherIntensity);
  const seasonRef = useRef(season);
  const agentDataRef = useRef(agents);

  useEffect(() => { timeRef.current = gameTime; }, [gameTime]);
  useEffect(() => { weatherRef.current = weather; }, [weather]);
  useEffect(() => { weatherIntensityRef.current = weatherIntensity; }, [weatherIntensity]);
  useEffect(() => { seasonRef.current = season; }, [season]);
  useEffect(() => { agentDataRef.current = agents; }, [agents]);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let app: PIXI.Application | null = null;

    (async () => {
      app = new PIXI.Application();
      await app.init({
        width, height,
        backgroundAlpha: 0,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
      });

      if (cancelled) { app.destroy(true); return; }

      containerRef.current!.appendChild(app.canvas);
      appRef.current = app;

      const ground = new PIXI.Graphics();
      groundRef.current = ground;
      app.stage.addChild(ground);

      const buildingsContainer = new PIXI.Container();
      buildingsContainerRef.current = buildingsContainer;
      app.stage.addChild(buildingsContainer);

      const agentsContainer = new PIXI.Container();
      agentsContainerRef.current = agentsContainer;
      app.stage.addChild(agentsContainer);

      const weatherContainer = new PIXI.Container();
      weatherContainerRef.current = weatherContainer;
      weatherContainer.eventMode = "none";
      app.stage.addChild(weatherContainer);

      const overlay = new PIXI.Graphics();
      overlayRef.current = overlay;
      overlay.eventMode = "none";
      app.stage.addChild(overlay);

      updateVisuals();

      // Animation frame accumulator
      let frameAccum = 0;
      const FRAME_INTERVAL = 8; // ticks between frames

      // Weather particle ticker
      let particles: PIXI.Graphics[] = [];
      app.ticker?.add(() => {
        const dt = app?.ticker?.deltaTime ?? 1;

        // ── I2: Frame animation for agents ──
        frameAccum += dt;
        const sprites = agentSpritesRef.current;
        const agentData = agentDataRef.current;

        if (frameAccum >= FRAME_INTERVAL) {
          frameAccum = 0;
          for (const ad of agentData) {
            const entry = sprites.get(ad.id);
            if (!entry) continue;
            const isMoving = ad.isMoving || entry.targetMoving;
            if (!isMoving) {
              entry.sprite.texture = entry.frames[0];
            } else {
              const currentIdx = entry.frames.indexOf(entry.sprite.texture);
              const nextIdx = (currentIdx + 1) % entry.frames.length;
              entry.sprite.texture = entry.frames[nextIdx];
            }
            if (ad.dir === "left") {
              entry.sprite.scale.x = -Math.abs(entry.sprite.scale.x);
            } else {
              entry.sprite.scale.x = Math.abs(entry.sprite.scale.x);
            }
          }
        }

        // ── I2: Position interpolation ──
        const lerpSpeed = 0.15 * dt;
        for (const ad of agentData) {
          const entry = sprites.get(ad.id);
          if (!entry) continue;
          entry.targetX = ad.x;
          entry.targetY = ad.y;
          entry.targetMoving = ad.isMoving ?? false;
          entry.container.x += (entry.targetX - entry.container.x) * lerpSpeed;
          entry.container.y += (entry.targetY - entry.container.y) * lerpSpeed;

          if (entry.activityText.text !== ad.currentActivity) {
            entry.activityText.text = ad.currentActivity;
          }
        }

        // ── Weather particles ──
        const w = weatherRef.current;
        const intensity = weatherIntensityRef.current;
        const wc = weatherContainerRef.current;
        if (!wc || w === "clear" || intensity <= 0) {
          for (const p of particles) { wc?.removeChild(p); p.destroy(); }
          particles = [];
          return;
        }

        const count = Math.floor(intensity * 100);
        const targetParticles = Math.min(count, 300);
        while (particles.length < targetParticles) {
          let p: PIXI.Graphics;
          const x = Math.random() * (width + 50) - 25;
          const y = Math.random() * (height + 50) - 25;
          if (w === "rain" || w === "storm") {
            p = spawnRainDrop(x, y, intensity);
          } else if (w === "snow") {
            p = spawnSnowFlake(x, y);
          } else if (w === "fog") {
            p = spawnFogPatch(x, y);
          } else {
            break;
          }
          wc.addChild(p);
          particles.push(p);
        }
        while (particles.length > targetParticles) {
          const p = particles.pop()!;
          wc.removeChild(p);
          p.destroy();
        }
        for (const p of particles) {
          if (w === "rain") {
            p.y += (4 + intensity * 3) * dt;
            if (p.y > height + 20) p.y -= height + 40;
          } else if (w === "storm") {
            p.y += (6 + intensity * 4) * dt;
            p.x += (Math.random() - 0.5) * 2 * dt;
            if (p.y > height + 20) p.y -= height + 40;
          } else if (w === "snow") {
            p.y += (1 + intensity) * dt;
            p.x += Math.sin(Date.now() / 1000 + p.x) * 0.3 * dt;
            if (p.y > height + 10) { p.y = -10; p.x = Math.random() * width; }
          } else if (w === "fog") {
            p.x += (0.1 + intensity * 0.2) * dt;
            if (p.x > width + 50) p.x = -50;
          }
        }
      });

      const interval = setInterval(updateVisuals, 1000);

      return () => {
        clearInterval(interval);
        if (app?.ticker) {
          app.ticker.destroy();
        }
        cancelled = true;
        if (app) {
          app.canvas.parentNode?.removeChild(app.canvas);
          app.destroy(true);
        }
      };
    })();

    function updateVisuals() {
      if (!groundRef.current || !overlayRef.current) return;
      const colors = getTimeOfDayColors(timeRef.current.hour);
      const seasonName = seasonRef.current;

      const ground = groundRef.current;
      ground.clear();
      for (let x = 0; x < width; x += tileSize) {
        for (let y = 0; y < height; y += tileSize) {
          const variation = Math.random() * 0x080808;
          ground.rect(x, y, tileSize, tileSize);
          ground.fill(colors.ground + variation);
        }
      }

      const overlay = overlayRef.current;
      overlay.clear();

      const seasonTint = SEASON_TINTS[seasonName] ?? 0xffffff;
      if (seasonTint !== 0xffffff) {
        overlay.rect(0, 0, width, height);
        overlay.fill({ color: seasonTint, alpha: 0.08 });
      }

      const darkness = 1 - colors.lightLevel;
      if (darkness > 0) {
        overlay.rect(0, 0, width, height);
        overlay.fill({ color: 0x000020, alpha: darkness * 0.6 });
      }

      buildingsContainerRef.current?.children.forEach((child) => {
        (child as PIXI.Container).alpha = colors.ambient;
      });
      agentsContainerRef.current?.children.forEach((child) => {
        (child as PIXI.Container).alpha = colors.ambient;
      });
    }
  }, [width, height, tileSize]);

  useEffect(() => {
    const container = buildingsContainerRef.current;
    if (!container) return;
    const sprites = buildingSpritesRef.current;
    buildings.forEach((building) => {
      let sprite = sprites.get(building.id);
      if (!sprite) {
        sprite = new PIXI.Container();
        const spriteUrl = getCachedSprite(`building-${building.type}-${building.name}`, () => generateBuildingSprite(building.type, building.name));
        const texture = PIXI.Texture.from(spriteUrl);
        const buildingSprite = new PIXI.Sprite(texture);
        buildingSprite.anchor.set(0.5);
        buildingSprite.scale.set(2);
        sprite.addChild(buildingSprite);
        const text = new PIXI.Text({ text: building.name, style: { fontSize: 11, fill: 0xffffff, fontFamily: "sans-serif", stroke: { color: 0x000000, width: 3 }, dropShadow: { color: 0x000000, distance: 1 } } });
        text.anchor.set(0.5, 1);
        text.position.set(0, -20);
        sprite.addChild(text);
        container.addChild(sprite);
        sprites.set(building.id, sprite);
      }
      sprite.x = building.x + building.width / 2;
      sprite.y = building.y + building.height / 2;
    });
    sprites.forEach((sprite, id) => {
      if (!buildings.find((b) => b.id === id)) { container.removeChild(sprite); sprites.delete(id); }
    });
  }, [buildings]);

  // I2: Use walk sheet sprite with frame cycling
  useEffect(() => {
    const container = agentsContainerRef.current;
    if (!container) return;
    const sprites = agentSpritesRef.current;
    agents.forEach((agent) => {
      let entry = sprites.get(agent.id);
      if (!entry) {
        const sheetUrl = getCachedSprite(`walk-${agent.id}`, () => generateWalkSheet({ name: agent.name, occupation: agent.occupation, seed: agent.name.split("").reduce((a, b) => a + b.charCodeAt(0), 0) }));
        const sheetTexture = PIXI.Texture.from(sheetUrl);
        const frames: PIXI.Texture[] = [];
        for (let i = 0; i < 4; i++) {
          const rect = new PIXI.Rectangle(i * 16, 0, 16, 24);
          frames.push(new PIXI.Texture({ source: sheetTexture.source, frame: rect }));
        }
        const agentSprite = new PIXI.Sprite(frames[0]);
        agentSprite.anchor.set(0.5, 1);
        agentSprite.scale.set(1.5);

        const spriteContainer = new PIXI.Container();
        spriteContainer.addChild(agentSprite);

        const nameText = new PIXI.Text({ text: agent.name, style: { fontSize: 10, fill: 0xffffff, fontFamily: "sans-serif", stroke: { color: 0x000000, width: 3 } } });
        nameText.anchor.set(0.5, 1);
        nameText.position.set(0, -28);
        spriteContainer.addChild(nameText);

        const activityText = new PIXI.Text({ text: agent.currentActivity, style: { fontSize: 8, fill: 0xffffaa, fontFamily: "sans-serif", stroke: { color: 0x000000, width: 2 } } });
        activityText.anchor.set(0.5, 0);
        activityText.position.set(0, 2);
        spriteContainer.addChild(activityText);

        spriteContainer.eventMode = "static";
        spriteContainer.cursor = "pointer";
        spriteContainer.on("pointerdown", () => { onAgentClick?.(agent); });

        container.addChild(spriteContainer);
        entry = { container: spriteContainer, sprite: agentSprite, frames, activityText, targetX: agent.x, targetY: agent.y, targetMoving: false };
        sprites.set(agent.id, entry);
      }
      entry.targetX = agent.x;
      entry.targetY = agent.y;
      entry.targetMoving = agent.isMoving ?? false;
      if (entry.activityText.text !== agent.currentActivity) {
        entry.activityText.text = agent.currentActivity;
      }
    });
    sprites.forEach((entry, id) => {
      if (!agents.find((a) => a.id === id)) { container.removeChild(entry.container); sprites.delete(id); }
    });
  }, [agents, onAgentClick]);

  return (
    <div ref={containerRef} className="relative rounded-lg overflow-hidden border border-border shadow-lg" style={{ width, height }} />
  );
}
