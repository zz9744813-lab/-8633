"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface DialogueBubbleProps {
  speakerName: string;
  message: string;
  x: number;
  y: number;
  duration?: number;
  onClose?: () => void;
}

export function DialogueBubble({
  speakerName,
  message,
  x,
  y,
  duration = 5000,
  onClose,
}: DialogueBubbleProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "absolute z-50 pointer-events-none",
        "animate-in fade-in slide-in-from-bottom-2 duration-300"
      )}
      style={{
        left: x,
        top: y - 60,
        transform: "translateX(-50%)",
      }}
    >
      <div className="relative bg-white dark:bg-zinc-900 rounded-lg px-3 py-2 shadow-lg border border-border max-w-[200px]">
        <p className="text-xs font-medium text-muted-foreground mb-1">
          {speakerName}
        </p>
        <p className="text-sm text-foreground leading-relaxed">{message}</p>
        {/* Triangle pointer */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-8 border-l-transparent border-r-transparent border-t-white dark:border-t-zinc-900" />
      </div>
    </div>
  );
}

// Dialogue manager component
interface ActiveDialogue {
  id: string;
  speakerName: string;
  message: string;
  x: number;
  y: number;
}

interface DialogueManagerProps {
  dialogues: ActiveDialogue[];
  onDialogueClose: (id: string) => void;
}

export function DialogueManager({ dialogues, onDialogueClose }: DialogueManagerProps) {
  return (
    <>
      {dialogues.map((dialogue) => (
        <DialogueBubble
          key={dialogue.id}
          speakerName={dialogue.speakerName}
          message={dialogue.message}
          x={dialogue.x}
          y={dialogue.y}
          onClose={() => onDialogueClose(dialogue.id)}
        />
      ))}
    </>
  );
}
