"use client";

import { useEffect, useState } from "react";
import { Brain, Sparkles, History, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MemoryViewerProps {
  agentId: string;
  agentName: string;
  isOpen: boolean;
  onClose: () => void;
  currentTick: number;
}

interface Memory {
  id: string;
  type: "observation" | "event" | "dialogue" | "reflection" | "plan";
  content: string;
  importance: number;
  tick: number;
}

interface Reflection {
  id: string;
  content: string;
  patternType?: string;
  createdTick: number;
}

export function MemoryViewer({ agentId, agentName, isOpen, onClose, currentTick }: MemoryViewerProps) {
  const [activeTab, setActiveTab] = useState<"stm" | "ltm" | "reflection">("stm");
  const [stm, setStm] = useState<Memory[]>([]);
  const [ltm, setLtm] = useState<Memory[]>([]);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !agentId) return;

    const fetchMemories = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/memories?agentId=${agentId}&layer=all&tick=${currentTick}`
        );
        if (response.ok) {
          const data = await response.json();
          setStm(data.stm || []);
          setLtm(data.ltm || []);
          setReflections(data.reflections || []);
        }
      } catch (error) {
        console.error("Failed to fetch memories:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMemories();
  }, [isOpen, agentId, currentTick]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "observation":
        return "👁️";
      case "event":
        return "📅";
      case "dialogue":
        return "💬";
      case "reflection":
        return "🤔";
      case "plan":
        return "📋";
      default:
        return "📝";
    }
  };

  const getImportanceColor = (importance: number) => {
    if (importance >= 0.8) return "bg-red-100 border-red-300 text-red-800";
    if (importance >= 0.6) return "bg-orange-100 border-orange-300 text-orange-800";
    if (importance >= 0.4) return "bg-yellow-100 border-yellow-300 text-yellow-800";
    return "bg-gray-100 border-gray-300 text-gray-800";
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50"
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          "fixed top-0 right-0 h-full w-[500px] bg-card border-l border-border shadow-2xl z-50 transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-semibold">{agentName} 的记忆</h2>
              <p className="text-xs text-muted-foreground">
                STM: {stm.length} | LTM: {ltm.length} | 反思: {reflections.length}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {[
            { id: "stm", label: "短期记忆", icon: History, count: stm.length },
            { id: "ltm", label: "长期记忆", icon: Brain, count: ltm.length },
            { id: "reflection", label: "反思", icon: Sparkles, count: reflections.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors flex-1",
                activeTab === tab.id
                  ? "border-b-2 border-primary text-foreground bg-primary/5"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto h-[calc(100%-120px)]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {activeTab === "stm" && (
                <div className="space-y-3">
                  {stm.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      暂无短期记忆
                    </p>
                  ) : (
                    stm.map((memory) => (
                      <div
                        key={memory.id}
                        className={cn(
                          "p-3 rounded-lg border text-sm",
                          getImportanceColor(memory.importance)
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-lg">{getTypeIcon(memory.type)}</span>
                          <div className="flex-1">
                            <p>{memory.content}</p>
                            <div className="flex items-center gap-2 mt-2 text-xs opacity-70">
                              <span>Tick {memory.tick}</span>
                              <span>•</span>
                              <span>重要性 {(memory.importance * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "ltm" && (
                <div className="space-y-3">
                  {ltm.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      暂无长期记忆
                    </p>
                  ) : (
                    ltm.map((memory) => (
                      <div
                        key={memory.id}
                        className="p-3 rounded-lg border bg-purple-50 border-purple-200 text-purple-900"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-lg">{getTypeIcon(memory.type)}</span>
                          <div className="flex-1">
                            <p>{memory.content}</p>
                            <div className="flex items-center gap-2 mt-2 text-xs opacity-70">
                              <span>Tick {memory.tick}</span>
                              <span>•</span>
                              <span>重要性 {(memory.importance * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "reflection" && (
                <div className="space-y-3">
                  {reflections.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      暂无反思记录
                    </p>
                  ) : (
                    reflections.map((reflection) => (
                      <div
                        key={reflection.id}
                        className="p-3 rounded-lg border bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200"
                      >
                        <div className="flex items-start gap-2">
                          <Sparkles className="w-5 h-5 text-amber-500 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-amber-900">
                              {reflection.content}
                            </p>
                            {reflection.patternType && (
                              <span className="inline-block mt-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                                {reflection.patternType}
                              </span>
                            )}
                            <p className="text-xs text-amber-700/70 mt-2">
                              Tick {reflection.createdTick}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
