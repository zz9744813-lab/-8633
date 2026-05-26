"use client";

import { Play, Pause, FastForward, Rewind, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

export type GameSpeed = 0 | 1 | 4 | 16 | 64;

interface TimeBarProps {
  currentTime: string;
  currentDate: string;
  season: string;
  tickCount: number;
  speed: GameSpeed;
  onSpeedChange: (speed: GameSpeed) => void;
  onPauseResume: () => void;
  onSkipToNext: () => void;
}

export function TimeBar({
  currentTime,
  currentDate,
  season,
  tickCount,
  speed,
  onSpeedChange,
  onPauseResume,
  onSkipToNext,
}: TimeBarProps) {
  const speeds: { value: GameSpeed; label: string }[] = [
    { value: 0, label: "暂停" },
    { value: 1, label: "1×" },
    { value: 4, label: "4×" },
    { value: 16, label: "16×" },
    { value: 64, label: "64×" },
  ];

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-card border-t border-border">
      {/* Time Display */}
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-2xl font-mono font-bold tracking-tight">{currentTime}</div>
          <div className="text-xs text-muted-foreground">
            {currentDate} · {season}
          </div>
        </div>
        <div className="text-xs text-muted-foreground font-mono">
          Tick: {tickCount.toLocaleString()}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPauseResume}
          className={cn(
            "p-2 rounded-md transition-colors",
            speed === 0
              ? "bg-primary text-primary-foreground"
              : "bg-secondary hover:bg-secondary/80"
          )}
          title={speed === 0 ? "继续" : "暂停"}
        >
          {speed === 0 ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
        </button>

        <div className="h-6 w-px bg-border mx-1" />

        {speeds.map((s) => (
          <button
            key={s.value}
            onClick={() => onSpeedChange(s.value)}
            className={cn(
              "px-3 py-2 rounded-md text-sm font-medium transition-colors",
              speed === s.value
                ? "bg-primary text-primary-foreground"
                : "bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}

        <div className="h-6 w-px bg-border mx-1" />

        <button
          onClick={onSkipToNext}
          className="p-2 rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
          title="跳到下一个事件"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
