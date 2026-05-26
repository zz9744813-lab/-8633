"use client";

import { useState, useEffect } from "react";
import { MessageCircle, TrendingUp, Users, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Rumor {
  id: string;
  tick: number;
  type: string;
  subject: string;
  content: string;
  truthLevel: number;
  spreadCount: number;
  knownByIds?: string[];
}

interface RumorPanelProps {
  worldId: string;
}

const typeEmoji: Record<string, string> = {
  scandal: "🔥",
  secret: "🤫",
  event: "📢",
  relationship: "💕",
  achievement: "🏆",
  danger: "⚠️",
};

const typeLabel: Record<string, string> = {
  scandal: "丑闻",
  secret: "秘密",
  event: "事件",
  relationship: "关系",
  achievement: "成就",
  danger: "危险",
};

export function RumorPanel({ worldId }: RumorPanelProps) {
  const [rumors, setRumors] = useState<Rumor[]>([]);
  const [hotRumors, setHotRumors] = useState<Rumor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHot, setShowHot] = useState(false);

  useEffect(() => {
    fetchRumors();
  }, [worldId]);

  async function fetchRumors() {
    try {
      setLoading(true);
      const [allRes, hotRes] = await Promise.all([
        fetch(`/api/rumors?worldId=${worldId}`),
        fetch(`/api/rumors?worldId=${worldId}&hot=true`),
      ]);

      const allData = await allRes.json();
      const hotData = await hotRes.json();

      setRumors(allData.rumors);
      setHotRumors(hotData.rumors);
    } catch (e) {
      console.error("Failed to load rumors:", e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <MessageCircle className="w-8 h-8 mx-auto mb-2 animate-pulse" />
        加载流言...
      </div>
    );
  }

  const displayRumors = showHot ? hotRumors : rumors;

  if (displayRumors.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        暂无流言<br />
        <span className="text-xs">居民们会在对话中传播流言</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          流言蜚语
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setShowHot(false)}
            className={cn(
              "text-xs px-2 py-1 rounded",
              !showHot ? "bg-primary text-primary-foreground" : "bg-muted"
            )}
          >
            全部
          </button>
          <button
            onClick={() => setShowHot(true)}
            className={cn(
              "text-xs px-2 py-1 rounded flex items-center gap-1",
              showHot ? "bg-primary text-primary-foreground" : "bg-muted"
            )}
          >
            <TrendingUp className="w-3 h-3" />
            热门
          </button>
        </div>
      </div>

      {/* Rumor list */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {displayRumors.map((rumor) => (
          <div
            key={rumor.id}
            className={cn(
              "p-2 rounded text-xs border",
              rumor.truthLevel < 0.3
                ? "bg-red-50 border-red-200"
                : rumor.truthLevel > 0.7
                ? "bg-green-50 border-green-200"
                : "bg-muted/30 border-muted"
            )}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">{typeEmoji[rumor.type] || "💬"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{typeLabel[rumor.type] || rumor.type}</span>
                  {rumor.spreadCount >= 3 && (
                    <span className="text-[10px] bg-yellow-100 text-yellow-800 px-1 rounded">
                      🔥 {rumor.spreadCount}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground mt-0.5 line-clamp-2">
                  {rumor.subject}{rumor.content.substring(0, 100)}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <Users className="w-3 h-3" />
                    {rumor.knownByIds?.length || 1}人知道
                  </span>
                  <span className="flex items-center gap-0.5">
                    <AlertCircle className="w-3 h-3" />
                    可信度{(rumor.truthLevel * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
