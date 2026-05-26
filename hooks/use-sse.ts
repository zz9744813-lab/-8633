"use client";

import { useEffect, useRef, useCallback } from "react";
import { useWorldStore } from "@/lib/store/world-store";

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { setWorld, updateWorld, setConnected } = useWorldStore();

  const connect = useCallback(() => {
    if (eventSourceRef.current?.readyState === EventSource.OPEN) {
      return;
    }

    const es = new EventSource("/api/sse");
    eventSourceRef.current = es;

    es.onopen = () => {
      console.log("SSE connected");
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "init") {
          setWorld(data.world);
        } else if (data.type === "tick") {
          updateWorld(data.world);
        }
      } catch (error) {
        console.error("Failed to parse SSE message:", error);
      }
    };

    es.onerror = (error) => {
      console.error("SSE error:", error);
      setConnected(false);
      es.close();

      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [setWorld, updateWorld, setConnected]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setConnected(false);
  }, [setConnected]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { connect, disconnect };
}
