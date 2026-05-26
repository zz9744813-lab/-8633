"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WorldView } from "@/components/world-view";
import { TimeBar, GameSpeed } from "@/components/time-bar";
import { ConfigPanel } from "@/components/config-panel";
import { cn } from "@/lib/utils";
import { Settings, Activity } from "lucide-react";

interface AgentState {
  id: string;
  name: string;
  x: number;
  y: number;
  activity: string;
  mood: number;
  energy: number;
}

interface WorldState {
  tick: number;
  time: string;
  date: string;
  season: string;
  agents: AgentState[];
  events: string[];
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

  // SSE connection ref
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect to SSE stream
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const effectiveSpeed = isPaused ? 0 : speed;
    const es = new EventSource(`/api/world/stream?speed=${effectiveSpeed}`);

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "init" || message.type === "update") {
          setWorldState(message.data);
        }
      } catch (e) {
        console.error("Failed to parse SSE message:", e);
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
    };

    eventSourceRef.current = es;
  }, [speed, isPaused]);

  // Initial connection
  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
    };
  }, [connect]);

  // Reconnect when speed changes
  useEffect(() => {
    const timeout = setTimeout(() => {
      connect();
    }, 100);
    return () => clearTimeout(timeout);
  }, [speed, isPaused, connect]);

  // Handlers
  const handleSpeedChange = useCallback((newSpeed: GameSpeed) => {
    setSpeed(newSpeed);
    if (newSpeed === 0) {
      setIsPaused(true);
    } else {
      setIsPaused(false);
    }
  }, []);

  const handlePauseResume = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      setSpeed((prev) => (prev === 0 ? 1 : prev));
    } else {
      setIsPaused(true);
      setSpeed(0);
    }
  }, [isPaused]);

  const handleSkipToNext = useCallback(() => {
    // Skip to next hour (6 ticks)
    if (worldState) {
      const ticksToNext = 6 - (worldState.tick % 6);
      // This would require a server call in real implementation
      // For now, just visual feedback
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
            </div>
          ) : (
            <div className="p-4 border rounded-lg bg-muted/50 text-center text-muted-foreground text-sm">
              点击居民查看详情
            </div>
          )}

          {/* Recent events */}
          <div className="flex-1">
            <h3 className="font-medium mb-3 text-sm">世界事件</h3>
            <div className="space-y-2">
              {worldState?.events.slice(0, 5).map((event, i) => (
                <div
                  key={i}
                  className="p-2 text-xs bg-muted rounded-md text-muted-foreground"
                >
                  {event}
                </div>
              )) || (
                <div className="text-xs text-muted-foreground">等待事件...</div>
              )}
            </div>
          </div>

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
    </div>
  );
}
