"use client";

import { useState, useEffect } from "react";
import { DollarSign, BarChart3, RotateCcw } from "lucide-react";
import type { UsageRecord } from "@/lib/llm/usage-tracker";

export function CostDashboard() {
  const [stats, setStats] = useState<{
    totalCalls: number;
    totalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCost: number;
    callsByPurpose: Record<string, number>;
    tokensByPurpose: Record<string, number>;
    averageTokensPerCall: number;
  } | null>(null);
  const [calls, setCalls] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/usage");
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
        setCalls(data.recent || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading && !stats) {
    return <div className="p-4 text-sm text-muted-foreground">加载用量统计...</div>;
  }

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5" />
          成本看板
        </h3>
        <div className="flex gap-1">
          <button onClick={fetchStats} className="text-xs text-primary hover:underline">刷新</button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2 bg-muted rounded">
            <div className="text-muted-foreground">调用次数</div>
            <div className="font-mono font-bold">{stats.totalCalls}</div>
          </div>
          <div className="p-2 bg-muted rounded">
            <div className="text-muted-foreground">估算费用</div>
            <div className="font-mono font-bold">${stats.totalCost.toFixed(4)}</div>
          </div>
          <div className="p-2 bg-muted rounded">
            <div className="text-muted-foreground">总 Token</div>
            <div className="font-mono font-bold">{stats.totalTokens.toLocaleString()}</div>
          </div>
          <div className="p-2 bg-muted rounded">
            <div className="text-muted-foreground">平均/次</div>
            <div className="font-mono font-bold">{stats.averageTokensPerCall}</div>
          </div>
        </div>
      )}

      {stats && Object.keys(stats.callsByPurpose).length > 0 && (
        <div className="text-xs">
          <h4 className="font-medium mb-1">按用途分</h4>
          <div className="space-y-1">
            {Object.entries(stats.callsByPurpose)
              .sort(([, a], [, b]) => b - a)
              .map(([purpose, count]) => (
                <div key={purpose} className="flex justify-between">
                  <span className="text-muted-foreground">{purpose}</span>
                  <span className="font-mono">{count} 次 ({stats.tokensByPurpose[purpose]?.toLocaleString()} tok)</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {calls.length > 0 && (
        <div className="text-xs">
          <h4 className="font-medium mb-1 flex items-center gap-1">
            <BarChart3 className="w-3 h-3" />
            最近调用
          </h4>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {calls.slice(0, 8).map((call, i) => (
              <div key={i} className="flex justify-between text-muted-foreground">
                <span>{call.purpose}</span>
                <span className="font-mono">{call.promptTokens + call.completionTokens} tok</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
