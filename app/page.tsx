"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WorldView } from "@/components/world-view";
import { AgentPortrait } from "@/components/agent-portrait";
import { TimeBar, GameSpeed } from "@/components/time-bar";
import { ConfigPanel } from "@/components/config-panel";
import { MemoryViewer } from "@/components/memory-viewer";
import { MessagesSquare } from "lucide-react";
import { EventLog } from "@/components/event-log";
import { DialogueManager } from "@/components/dialogue-bubble";
import { ChroniclePanel } from "@/components/chronicle-panel";
import { RumorPanel } from "@/components/rumor-panel";
import { CostDashboard } from "@/components/cost-dashboard";
import { cn } from "@/lib/utils";
import { Settings, Activity, Brain } from "lucide-react";

interface AgentState {
  id: string;
  name: string;
  occupation: string;
  gender?: string;
  x: number;
  y: number;
  activity: string;
  mood: number;
  energy: number;
  health?: number;
  status?: string;
  skills?: Record<string, number>;
  currentGoals?: string[];
  isMoving?: boolean;
  dir?: string;
  money?: number;
  inventory?: Record<string, number>;
  portraitUrl?: string;
  appearance?: { description?: string; hairColor?: string; skinTone?: string; distinguishingFeatures?: string[] };
  knownLanguages?: string[];
  dailyPlan?: { morningThought: string; steps: { time: string; description: string }[]; currentStepIdx: number };
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
  weather: string;
  weatherIntensity: number;
  agents: AgentState[];
  events: WorldEvent[];
  eraPack?: any;
}

function formatGameTime(tick: number): string {
  const minutesPerTick = 10;
  const totalMinutes = tick * minutesPerTick;
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

const ITEM_NAMES: Record<string, string> = {
  bread: "面包", meat: "肉", ale: "麦酒", cloth: "布料",
  tool: "工具", wood: "木材", iron: "铁", potion: "药剂",
};

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
  const [sayMessage, setSayMessage] = useState("");
  const [agentVocab, setAgentVocab] = useState<Array<{ word: string; meaning: string; usageCount: number; fidelity: number }>>([]);

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
            season: message.world.season ?? getSeason(message.world.tick),
            weather: message.world.weather ?? "clear",
            weatherIntensity: message.world.weatherIntensity ?? 0,
            agents: message.world.agents.map((a: any) => ({
              id: a.id,
              name: a.identity.name,
              occupation: a.identity.occupation,
              gender: a.identity.gender,
              x: a.state.position.x,
              y: a.state.position.y,
              activity: a.state.currentActivity,
              mood: a.state.mood,
              energy: a.state.energy,
              health: a.state.health,
              status: a.state.status,
              skills: a.state.skills,
              currentGoals: a.state.currentGoals,
              isMoving: a.state.isMoving,
              dir: a.state.position.dir,
              money: a.state.money,
              inventory: a.state.inventory,
              knownLanguages: a.identity.knownLanguages,
              dailyPlan: a.dailyPlan,
              portraitUrl: a.identity.portraitUrl,
              appearance: a.identity.appearance,
            })),
            events: [],
            eraPack: message.world.eraPack,
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

  // H2: Fetch agent vocab when selection changes
  useEffect(() => {
    if (selectedAgent?.id) {
      fetch(`/api/lexicon?agentId=${selectedAgent.id}`)
        .then(r => r.json())
        .then(d => setAgentVocab(d.words ?? []))
        .catch(() => setAgentVocab([]));
    } else {
      setAgentVocab([]);
    }
  }, [selectedAgent?.id]);

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
    id: a.id,
    x: a.x,
    y: a.y,
    name: a.name,
    occupation: a.occupation,
    currentActivity: a.activity,
    isMoving: a.isMoving,
    dir: a.dir,
  })) || [
    { id: "1", x: 400, y: 300, name: "居民1", occupation: "无业", currentActivity: "idle" },
    { id: "2", x: 200, y: 400, name: "居民2", occupation: "无业", currentActivity: "idle" },
    { id: "3", x: 600, y: 200, name: "居民3", occupation: "无业", currentActivity: "idle" },
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
            weather={worldState?.weather}
            weatherIntensity={worldState?.weatherIntensity}
            season={worldState?.season}
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
              <div className="flex justify-center mb-3">
                <AgentPortrait
                  agentId={selectedAgent.id}
                  name={selectedAgent.name}
                  occupation={selectedAgent.occupation}
                  gender={selectedAgent.gender}
                  eraName={worldState?.eraPack?.name}
                  appearance={selectedAgent.appearance}
                  eraPack={worldState?.eraPack}
                  portraitUrl={selectedAgent.portraitUrl}
                  size={96}
                />
              </div>
              <h3 className="font-bold flex items-center gap-2 mb-3">
                <Activity className="w-4 h-4" />
                {selectedAgent.name}
              </h3>
              <div className="text-xs mb-2">
                <span className="text-muted-foreground">会说：</span>
                {(selectedAgent.knownLanguages ?? ["common"]).map(l =>
                  <span key={l} className="inline-block bg-muted rounded px-1 mx-0.5">{l}</span>
                )}
              </div>
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

              {/* G3: Skills bar chart */}
              {selectedAgent.skills && Object.keys(selectedAgent.skills).length > 0 && (
                <div className="mt-3 text-xs space-y-1">
                  {Object.entries(selectedAgent.skills).map(([name, lv]) => (
                    <div key={name}>
                      <div className="flex justify-between">
                        <span>{name}</span>
                        <span className="text-muted-foreground">{Math.floor(lv)}/100</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary rounded transition-all" style={{ width: `${lv}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* G4: Wallet display */}
              <div className="mt-3 text-xs flex items-center gap-2">
                <span className="font-bold">钱包</span>
                <span className="text-yellow-600 font-mono">{selectedAgent.money?.toFixed(1) ?? "0.0"} 币</span>
              </div>

              {/* G4: Inventory display */}
              {selectedAgent.inventory && Object.keys(selectedAgent.inventory).length > 0 && (
                <div className="mt-2 text-xs">
                  <span className="font-bold">背包</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(selectedAgent.inventory).map(([itemId, qty]) => (
                      qty > 0 ? (
                        <span key={itemId} className="px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                          {ITEM_NAMES[itemId] ?? itemId}×{qty}
                        </span>
                      ) : null
                    ))}
                  </div>
                </div>
              )}

              {/* Daily Plan Display */}
              {selectedAgent.dailyPlan && (
                <div className="mt-4 border-t pt-3">
                  <div className="text-xs font-bold mb-2 text-muted-foreground">
                    今日计划：{selectedAgent.dailyPlan.morningThought}
                  </div>
                  <div className="space-y-1">
                    {selectedAgent.dailyPlan.steps.map((step, i) => (
                      <div
                        key={i}
                        className={cn(
                          "text-xs py-1 px-2 rounded",
                          i === selectedAgent.dailyPlan?.currentStepIdx
                            ? "bg-yellow-100 border-l-2 border-yellow-500"
                            : i < (selectedAgent.dailyPlan?.currentStepIdx ?? 0)
                              ? "text-muted-foreground opacity-60"
                              : ""
                        )}
                      >
                        <span className="font-mono">{step.time}</span> {step.description}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* F2.4: Long-term Goals Display */}
              {selectedAgent.currentGoals && selectedAgent.currentGoals.length > 0 && (
                <div className="mt-3 text-xs">
                  <div className="font-bold mb-1">🎯 长期目标</div>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {selectedAgent.currentGoals.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* H2: Agent vocab display */}
              {agentVocab.length > 0 && (
                <div className="mt-3 text-xs">
                  <div className="font-bold mb-1 flex items-center gap-1">
                    <MessagesSquare className="w-3 h-3" />
                    知道的私词
                  </div>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {agentVocab.map((v, i) => (
                      <div key={i} className="flex justify-between text-muted-foreground">
                        <span>"{v.word}"</span>
                        <span>{v.meaning}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

          {/* EventLog */}
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

          {/* F1: Chronicle Panel */}
          <ChroniclePanel worldId="default" />

          {/* F3: Rumor Panel */}
          <RumorPanel worldId="default" />

          {/* J4: Cost Dashboard */}
          <CostDashboard />

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

          {/* J3: Player intervention panel */}
          {selectedAgent && (
            <div className="border-t pt-3 mt-3">
              <h4 className="font-bold text-xs mb-2">干预 {selectedAgent.name}</h4>
              <div className="flex gap-1">
                <input
                  placeholder="让TA说..."
                  className="flex-1 px-2 py-1 text-xs bg-background border rounded"
                  value={sayMessage}
                  onChange={(e) => setSayMessage(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && sayMessage.trim()) {
                      await fetch("/api/intervention", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ command: "say", params: { agentId: selectedAgent.id, message: sayMessage } }),
                      });
                      setSayMessage("");
                    }
                  }}
                />
                <button className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded" onClick={async () => {
                  if (!sayMessage.trim()) return;
                  await fetch("/api/intervention", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ command: "say", params: { agentId: selectedAgent.id, message: sayMessage } }),
                  });
                  setSayMessage("");
                }}>说</button>
              </div>
              <div className="flex gap-1 mt-1">
                <button className="px-2 py-1 text-xs bg-destructive text-destructive-foreground rounded" onClick={async () => {
                  if (!confirm(`移除 ${selectedAgent.name}?`)) return;
                  await fetch("/api/intervention", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ command: "remove", params: { targetType: "agent", targetId: selectedAgent.id } }),
                  });
                }}>移除</button>
                <button className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded" onClick={async () => {
                  await fetch("/api/intervention", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ command: "emotion", params: { agentId: selectedAgent.id, mood: 80, stress: 10 } }),
                  });
                }}>安抚</button>
                <button className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded" onClick={async () => {
                  await fetch("/api/intervention", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ command: "emotion", params: { agentId: selectedAgent.id, mood: 10, stress: 80 } }),
                  });
                }}>激怒</button>
              </div>
            </div>
          )}
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
