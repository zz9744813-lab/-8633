"use client";

import { useMemo } from "react";
import {
  generateAgentPortrait,
  getCachedSprite,
} from "@/lib/sprite-generator";

interface AgentPortraitProps {
  agentId: string;
  name: string;
  occupation: string;
  size?: number;
  className?: string;
}

export function AgentPortrait({
  agentId,
  name,
  occupation,
  size = 64,
  className = "",
}: AgentPortraitProps) {
  const portraitUrl = useMemo(() => {
    return getCachedSprite(`portrait-${agentId}`, () =>
      generateAgentPortrait({
        name,
        occupation,
        seed: name.split("").reduce((a, b) => a + b.charCodeAt(0), 0),
      })
    );
  }, [agentId, name, occupation]);

  return (
    <div
      className={`relative rounded-lg overflow-hidden border-2 border-border bg-muted ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={portraitUrl}
        alt={name}
        className="w-full h-full object-cover pixelated"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}

interface AgentDialogueCardProps {
  agentId: string;
  name: string;
  occupation: string;
  message: string;
  isRight?: boolean;
}

export function AgentDialogueCard({
  agentId,
  name,
  occupation,
  message,
  isRight = false,
}: AgentDialogueCardProps) {
  return (
    <div
      className={`flex gap-3 p-3 rounded-lg bg-card border ${
        isRight ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <AgentPortrait
        agentId={agentId}
        name={name}
        occupation={occupation}
        size={48}
      />
      <div className={`flex-1 ${isRight ? "text-right" : "text-left"}`}>
        <div className="text-sm font-medium text-foreground">{name}</div>
        <div className="text-xs text-muted-foreground">{occupation}</div>
        <div className="mt-1 text-sm text-foreground">{message}</div>
      </div>
    </div>
  );
}
