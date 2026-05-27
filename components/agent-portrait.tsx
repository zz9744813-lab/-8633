"use client";

import { useMemo, useState, useEffect } from "react";
import {
  generateAgentPortrait,
  generatePortrait,
  getCachedSprite,
} from "@/lib/sprite-generator";
import { loadConfig } from "@/lib/config/store";

interface AgentPortraitProps {
  agentId: string;
  name: string;
  occupation: string;
  gender?: string;
  eraName?: string;
  size?: number;
  className?: string;
  portraitUrl?: string | null;
}

export function AgentPortrait({
  agentId,
  name,
  occupation,
  gender = "male",
  eraName,
  size = 64,
  className = "",
  portraitUrl: propPortraitUrl,
}: AgentPortraitProps) {
  const [aiUrl, setAiUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fallbackUrl = useMemo(() => {
    return getCachedSprite(`portrait-${agentId}`, () =>
      generateAgentPortrait({
        name,
        occupation,
        seed: name.split("").reduce((a, b) => a + b.charCodeAt(0), 0),
        gender: gender as any,
      })
    );
  }, [agentId, name, occupation, gender]);

  useEffect(() => {
    // If portraitUrl already provided (e.g. from SSE/DB), use it directly
    if (propPortraitUrl) {
      setAiUrl(propPortraitUrl);
      return;
    }

    const config = loadConfig();
    if (!config.falApiKey) return;

    // Check session cache
    const cached = sessionStorage.getItem(`fal-portrait-${agentId}`);
    if (cached) {
      setAiUrl(cached);
      return;
    }

    setLoading(true);
    generatePortrait(name, occupation, gender, config.falApiKey, eraName)
      .then((url) => {
        if (url) {
          sessionStorage.setItem(`fal-portrait-${agentId}`, url);
          setAiUrl(url);
          // Persist to DB
          fetch("/api/agents/portrait", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agentId, portraitUrl: url }),
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId, name, occupation, gender, eraName, propPortraitUrl]);

  const portraitUrl = aiUrl || fallbackUrl;

  return (
    <div
      className={`relative rounded-lg overflow-hidden border-2 border-border bg-muted ${className} ${loading ? "animate-pulse" : ""}`}
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
  gender?: string;
  eraName?: string;
  message: string;
  isRight?: boolean;
}

export function AgentDialogueCard({
  agentId,
  name,
  occupation,
  gender,
  eraName,
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
        gender={gender}
        eraName={eraName}
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
