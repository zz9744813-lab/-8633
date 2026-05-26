"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Scroll, AlertTriangle, Sun, CloudRain, Users } from "lucide-react";

interface WorldEvent {
  id: string;
  tick: number;
  time: string;
  type: "weather" | "festival" | "disaster" | "arrival" | "social" | "intervention";
  description: string;
  severity?: "low" | "medium" | "high";
}

interface EventLogProps {
  events: WorldEvent[];
  maxHeight?: number;
}

const typeConfig = {
  weather: { icon: Sun, color: "text-blue-500", bg: "bg-blue-50" },
  festival: { icon: Users, color: "text-green-500", bg: "bg-green-50" },
  disaster: { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50" },
  arrival: { icon: Users, color: "text-purple-500", bg: "bg-purple-50" },
  social: { icon: Users, color: "text-yellow-500", bg: "bg-yellow-50" },
  intervention: { icon: Scroll, color: "text-orange-500", bg: "bg-orange-50" },
};

export function EventLog({ events, maxHeight = 300 }: EventLogProps) {
  const [filter, setFilter] = useState<string | null>(null);

  const filteredEvents = filter
    ? events.filter((e) => e.type === filter)
    : events;

  const formatTime = (tick: number) => {
    const minutesPerTick = 10;
    const totalMinutes = tick * minutesPerTick;
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  };

  return (
    <div className="border rounded-lg bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-medium flex items-center gap-2">
          <Scroll className="w-4 h-4" />
          世界事件
        </h3>
        <div className="flex gap-1">
          {Object.entries(typeConfig).map(([type, config]) => (
            <button
              key={type}
              onClick={() => setFilter(filter === type ? null : type)}
              className={cn(
                "p-1.5 rounded transition-colors",
                filter === type ? config.bg : "hover:bg-muted",
                filter === type ? config.color : "text-muted-foreground"
              )}
              title={type}
            >
              <config.icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>
      </div>

      <div
        className="overflow-y-auto p-2 space-y-1"
        style={{ maxHeight }}
      >
        {filteredEvents.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">
            暂无事件
          </p>
        ) : (
          filteredEvents.map((event) => {
            const config = typeConfig[event.type];
            return (
              <div
                key={event.id}
                className={cn(
                  "flex gap-2 p-2 rounded-md text-sm",
                  config.bg
                )}
              >
                <config.icon className={cn("w-4 h-4 mt-0.5 shrink-0", config.color)} />
                <div className="flex-1 min-w-0">
                  <p className="text-foreground">{event.description}</p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{formatTime(event.tick)}</span>
                    <span>•</span>
                    <span className="capitalize">{event.type}</span>
                    {event.severity && (
                      <>
                        <span>•</span>
                        <span className={cn(
                          event.severity === "high" && "text-red-600 font-medium"
                        )}>
                          {event.severity === "high" ? "严重" : event.severity === "medium" ? "中等" : "轻微"}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
