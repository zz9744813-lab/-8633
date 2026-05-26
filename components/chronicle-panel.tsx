"use client";

import { useState, useEffect } from "react";
import { ScrollText, Calendar, Users, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Chronicle {
  id: string;
  tick: number;
  year: number;
  season: string;
  day: number;
  type: string;
  title: string;
  description: string;
  agentIds?: string[];
  buildingIds?: string[];
  importance: number;
}

interface ChroniclePanelProps {
  worldId: string;
}

const seasonEmoji: Record<string, string> = {
  spring: "🌸",
  summer: "☀️",
  autumn: "🍂",
  winter: "❄️",
};

const typeEmoji: Record<string, string> = {
  birth: "👶",
  death: "⚰️",
  building: "🏗️",
  marriage: "💕",
  war: "⚔️",
  disaster: "🔥",
  milestone: "⭐",
  achievement: "🏆",
};

export function ChroniclePanel({ worldId }: ChroniclePanelProps) {
  const [chronicles, setChronicles] = useState<Chronicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [years, setYears] = useState<number[]>([]);

  useEffect(() => {
    fetchChronicles();
  }, [worldId, selectedYear]);

  async function fetchChronicles() {
    try {
      setLoading(true);
      const params = new URLSearchParams({ worldId, limit: "100" });
      if (selectedYear) params.set("year", selectedYear.toString());

      const res = await fetch(`/api/chronicles?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setChronicles(data.chronicles);

      // Extract unique years
      const uniqueYears = Array.from(
        new Set(data.chronicles.map((c: Chronicle) => c.year))
      ).sort((a, b) => b - a) as number[];
      setYears(uniqueYears);
    } catch (e) {
      console.error("Failed to load chronicles:", e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <ScrollText className="w-8 h-8 mx-auto mb-2 animate-pulse" />
        加载编年史...
      </div>
    );
  }

  if (chronicles.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        暂无历史记录<br />
        <span className="text-xs">随着世界运转，重要事件将被记录于此</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <ScrollText className="w-4 h-4" />
          编年史
        </h3>
        <select
          value={selectedYear ?? ""}
          onChange={(e) =>
            setSelectedYear(e.target.value ? parseInt(e.target.value) : null)
          }
          className="text-xs border rounded px-2 py-1 bg-background"
        >
          <option value="">全部年份</option>
          {years.map((y) => (
            <option key={y} value={y}>
              第 {y} 年
            </option>
          ))}
        </select>
      </div>

      {/* Chronicle list */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {chronicles.map((chronicle) => (
          <div
            key={chronicle.id}
            className={cn(
              "p-2 rounded text-xs border-l-2",
              chronicle.importance >= 0.8
                ? "bg-yellow-50 border-yellow-500"
                : chronicle.importance >= 0.6
                ? "bg-blue-50 border-blue-400"
                : "bg-muted/30 border-muted"
            )}
          >
            <div className="flex items-start gap-2">
              <span className="text-lg">{typeEmoji[chronicle.type] || "📜"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{chronicle.title}</div>
                <div className="text-muted-foreground mt-0.5 line-clamp-2">
                  {chronicle.description}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span>
                    第 {chronicle.year} 年 {seasonEmoji[chronicle.season]}
                  </span>
                  {chronicle.agentIds && chronicle.agentIds.length > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Users className="w-3 h-3" />
                      {chronicle.agentIds.length}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
