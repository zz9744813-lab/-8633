import { NextRequest } from "next/server";
import { getWorld } from "@/lib/agent";

export const dynamic = "force-dynamic";

// SSE endpoint for real-time world updates
export async function GET(request: NextRequest) {
  const world = getWorld();

  if (!world) {
    return new Response("No active world", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const initialData = `data: ${JSON.stringify({
        type: "init",
        world: world.toJSON(),
      })}\n\n`;
      controller.enqueue(encoder.encode(initialData));

      // Subscribe to tick updates
      const sendUpdate = (w: typeof world) => {
        const data = `data: ${JSON.stringify({
          type: "tick",
          world: w.toJSON(),
        })}\n\n`;
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Client disconnected
          world.onTickCallbacks = world.onTickCallbacks.filter((cb) => cb !== sendUpdate);
        }
      };

      world.onTick(sendUpdate);

      // Send heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":heartbeat\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Cleanup on close
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        world.onTickCallbacks = world.onTickCallbacks.filter((cb) => cb !== sendUpdate);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
