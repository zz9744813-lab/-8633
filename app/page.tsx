"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WorldView } from "@/components/world-view";
import { TimeBar, GameSpeed } from "@/components/time-bar";
import { ConfigPanel } from "@/components/config-panel";
import { MemoryViewer } from "@/components/memory-viewer";
import { EventLog } from "@/components/event-log";
import { DialogueManager } from "@/components/dialogue-bubble";
import { cn } from "@/lib/utils";
import { Settings, Activity, Brain } from "lucide-react";

interface AgentState {
  id: string;
  name: string;
  x: number;
  y: number;
  activity: string;
  mood: number;
  energy: number;
}

interface WorldEvent {
  id: string;
  tick: number;
  time: string;
  type: "weather" | "festival" | "disaster" | "arrival" | "social" | "intervention";
  description: string;
  severity?: "low" | "medium" | "high";
}

interface WorldState {
  tick: number;
  time: string;
  date: string;
  season: string;
  agents: AgentState[];
  events: WorldEvent[];
}

function formatGameTime(tick: number): string {
  const minutesPerTick = 10;
  const totalMinutes = tick * minutesPerTick;
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function getSeason(tick: number): string {
  const ticksPerDay = 144;
  const day = Math.floor(tick / ticksPerDay) % 360;
  const seasonIndex = Math.floor(day / 90);
  return ["春", "夏", "秋", "冬"][seasonIndex];
}

export default function Home() {
  // UI state
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Game state
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [speed, setSpeed] = useState<GameSpeed>(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentState | null>(null);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);

  // SSE connection ref
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/api/sse");

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "init" || message.type === "tick") {
          setWorldState({
            tick: message.world.tick,
            time: formatGameTime(message.world.tick),
            date: `第 ${Math.floor(message.world.tick / 144) + 1} 年`,
            season: getSeason(message.world.tick),
            agents: message.world.agents.map((a: { id: string; identity: { name: string }; state: { position: { x: number; y: number }; currentActivity: string; mood: number; energy: number } }) => ({
              id: a.id,
              name: a.identity.name,
              x: a.state.position.x,
              y: a.state.position.y,
              activity: a.state.currentActivity,
              mood: a.state.mood,
              energy: a.state.energy,
            })),
            events: [],
          });
        }
      } catch (e) {
        console.error("Failed to parse SSE message:", e);
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };

    eventSourceRef.current = es;
  }, []);

  // Initial connection
  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  // Handlers
  const handleSpeedChange = useCallback((newSpeed: GameSpeed) => {
    setSpeed(newSpeed);
    // Send control command to server
    fetch("/api/simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: newSpeed === 0 ? "pause" : "setSpeed", speed: newSpeed }),
    });
    if (newSpeed === 0) {
      setIsPaused(true);
    } else {
      setIsPaused(false);
    }
  }, []);

  const handlePauseResume = useCallback(() => {
    const newPaused = !isPaused;
    setIsPaused(newPaused);
    fetch("/api/simulation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: newPaused ? "pause" : "resume" }),
    });
  }, [isPaused]);

  const handleSkipToNext = useCallback(() => {
    // Skip to next hour (6 ticks)
    if (worldState) {
      const ticksToNext = 6 - (worldState.tick % 6);
      fetch("/api/simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tick", count: ticksToNext }),
      });
    }
  }, [worldState]);

  // Agent positions for WorldView
  const agentPositions = worldState?.agents.map((a) => ({
    x: a.x,
    y: a.y,
    name: a.name,
  })) || [
    { x: 400, y: 300, name: "居民1" },
    { x: 200, y: 400, name: "居民2" },
    { x: 600, y: 200, name: "居民3" },
  ];

  const buildingPositions = [
    { x: 200, y: 150, name: "酒馆" },
    { x: 500, y: 200, name: "集市" },
    { x: 350, y: 400, name: "教堂" },
    { x: 600, y: 400, name: "铁匠铺" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">PT</span>
          </div>
          <div>
            <h1 className="font-bold text-lg">像素小镇</h1>
            <p className="text-xs text-muted-foreground">AI Agent Sandbox</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Connection status */}
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
              isConnected
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}
          >
            <div
              className={cn(
                "w-2 h-2 rounded-full",
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
              )}
            />
            {isConnected ? "已连接" : "断开"}
          </div>

          <button
            onClick={() => setIsConfigOpen(true)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-md transition-colors",
              isConfigOpen
                ? "bg-primary text-primary-foreground"
                : "bg-secondary hover:bg-secondary/80"
            )}
          >
            <Settings className="w-4 h-4" />
            <span className="text-sm font-medium">配置</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: World view */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          <WorldView
            width={800}
            height={600}
            tileSize={10}
            agents={agentPositions}
            onAgentClick={(agent) => {
              const fullAgent = worldState?.agents.find((a) => a.name === agent.name);
              if (fullAgent) setSelectedAgent(fullAgent);
            }}
          />

          <TimeBar
            currentTime={worldState?.time || "08:00"}
            currentDate={worldState?.date || "第 1 年 1 月 1 日"}
            season={worldState?.season || "春"}
            tickCount={worldState?.tick || 0}
            speed={speed}
            onSpeedChange={handleSpeedChange}
            onPauseResume={handlePauseResume}
            onSkipToNext={handleSkipToNext}
          />
        </div>

        {/* Right: Info panel */}
        <div className="w-80 border-l border-border bg-card p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Agent detail */}
          {selectedAgent ? (
            <div className="p-4 border rounded-lg bg-background">
              <h3 className="font-bold flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4" />
                {selectedAgent.name}
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">活动</span>
                  <span>{selectedAgent.activity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">心情</span>
                  <span>{selectedAgent.mood.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">精力</span>
                  <span>{selectedAgent.energy.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">位置</span>
                  <span>({selectedAgent.x.toFixed(0)}, {selectedAgent.y.toFixed(0)})</span>
                </div>
              </div>
              <button
                onClick={() => setIsMemoryOpen(true)}
                className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-md text-sm font-medium transition-colors"
              >
                <Brain className="w-4 h-4" />
                查看记忆
              </button>
            </div>
          ) : (
            <div className="p-4 border rounded-lg bg-muted/50 text-center text-muted-foreground text-sm">
              点击居民查看详情
            </div>
          )}

          {/* Recent events */}
          <EventLog
            events={[
              {
                id: "1",
                tick: worldState?.tick || 0,
                time: worldState?.time || "08:00",
                type: "social",
                description: "新的一天开始了",
              },
            ]}
            maxHeight={200}
          />

          {/* Agent list */}
          <div>
            <h3 className="font-medium mb-3 text-sm">居民列表</h3>
            <div className="space-y-2">
              {worldState?.agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  className={cn(
                    "w-full p-2 text-left text-sm rounded-md transition-colors",
                    selectedAgent?.id === agent.id
                      ? "bg-primary/10 border border-primary/30"
                      : "bg-muted hover:bg-muted/80"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{agent.name}</span>
                    <span className="text-xs text-muted-foreground">{agent.activity}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Config panel */}
      <ConfigPanel isOpen={isConfigOpen} onClose={() => setIsConfigOpen(false)} />

      {/* Memory viewer */}
      <MemoryViewer
        agentId={selectedAgent?.id || ""}
        agentName={selectedAgent?.name || ""}
        isOpen={isMemoryOpen}
        onClose={() => setIsMemoryOpen(false)}
        currentTick={worldState?.tick || 0}
      />
    </div>
  );
}
