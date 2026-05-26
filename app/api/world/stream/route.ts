import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// Mock world state (in-memory for Phase 2)
let worldState = {
  tick: 0,
  time: "08:00",
  date: "第 1 年 1 月 1 日",
  season: "春",
  agents: [
    { id: "1", name: "居民1", x: 400, y: 300, activity: "闲逛", mood: 50, energy: 70 },
    { id: "2", name: "居民2", x: 200, y: 400, activity: "工作", mood: 60, energy: 60 },
    { id: "3", name: "居民3", x: 600, y: 200, activity: "休息", mood: 70, energy: 80 },
  ],
  events: [] as string[],
};

// Speed multiplier affects tick rate
let speedMultiplier = 1;

// Game time calculation
const GAME_MINUTES_PER_TICK = 10;
const TICKS_PER_HOUR = 6;
const SEASONS = ["春", "夏", "秋", "冬"];

function calculateGameTime(tick: number) {
  const totalMinutes = tick * GAME_MINUTES_PER_TICK;
  const minute = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60) % 24;
  const day = Math.floor(totalMinutes / 60 / 24) % 30 + 1;
  const month = Math.floor(totalMinutes / 60 / 24 / 30) % 12 + 1;
  const year = Math.floor(totalMinutes / 60 / 24 / 30 / 12) + 1;
  const seasonIndex = Math.floor((month - 1) / 3) % 4;

  return {
    time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
    date: `第 ${year} 年 ${month} 月 ${day} 日`,
    season: SEASONS[seasonIndex],
  };
}

// Simulate agent movement and activity
function simulateWorldTick() {
  worldState.tick++;

  // Update time
  const gameTime = calculateGameTime(worldState.tick);
  worldState.time = gameTime.time;
  worldState.date = gameTime.date;
  worldState.season = gameTime.season;

  // Random agent movement (simulate)
  worldState.agents = worldState.agents.map((agent) => {
    // Random small position change
    const dx = (Math.random() - 0.5) * 4;
    const dy = (Math.random() - 0.5) * 4;

    // Random activity change (5% chance)
    let activity = agent.activity;
    if (Math.random() < 0.05) {
      const activities = ["闲逛", "工作", "休息", "吃饭", "社交"];
      activity = activities[Math.floor(Math.random() * activities.length)];
    }

    // Update stats
    let energy = agent.energy + (activity === "休息" ? 2 : -0.5);
    let mood = agent.mood + (Math.random() - 0.5) * 5;

    // Clamp values
    energy = Math.max(0, Math.min(100, energy));
    mood = Math.max(0, Math.min(100, mood));

    return {
      ...agent,
      x: Math.max(10, Math.min(790, agent.x + dx)),
      y: Math.max(10, Math.min(590, agent.y + dy)),
      activity,
      energy,
      mood,
    };
  });

  // Generate random events (1% chance per tick)
  if (Math.random() < 0.01) {
    const events = [
      `${worldState.agents[0].name} 发现了一件有趣的事`,
      `${worldState.agents[1].name} 正在思考人生`,
      `${worldState.agents[2].name} 想要吃点什么`,
      "一只鸟飞过天空",
      "风吹过树梢",
    ];
    const newEvent = events[Math.floor(Math.random() * events.length)];
    worldState.events.unshift(`${worldState.time} - ${newEvent}`);
    if (worldState.events.length > 10) {
      worldState.events.pop();
    }
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const speed = parseInt(searchParams.get("speed") || "1", 10);
  speedMultiplier = speed;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const initialData = JSON.stringify({
        type: "init",
        data: worldState,
      });
      controller.enqueue(encoder.encode(`data: ${initialData}\n\n`));

      // Set up tick interval based on speed
      const intervalMs = speed > 0 ? 1000 / speed : 1000;

      const interval = setInterval(() => {
        if (speed > 0) {
          simulateWorldTick();
        }

        const update = JSON.stringify({
          type: "update",
          data: worldState,
        });

        try {
          controller.enqueue(encoder.encode(`data: ${update}\n\n`));
        } catch (e) {
          // Client disconnected
          clearInterval(interval);
        }
      }, intervalMs);

      // Clean up on abort
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
