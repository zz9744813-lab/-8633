import { NextRequest } from "next/server";
import { getWorld } from "@/lib/agent";
import { worldRepository } from "@/db/world-repository";

export const dynamic = "force-dynamic";

// SSE endpoint for real-time world updates
export async function GET(request: NextRequest) {
  let world = getWorld();

  // T1.4: If no active world, try to load from DB
  if (!world) {
    try {
      const worlds = await worldRepository.listWorlds();
      if (worlds.length > 0) {
        const latest = worlds[0];
        const { createWorldOrLoad } = await import("@/lib/agent");
        world = await createWorldOrLoad(latest.id, latest.name, latest.width, latest.height, null);
        console.log(`[SSE] Loaded latest world "${latest.name}" from DB`);
      }
    } catch (e) {
      console.error("[SSE] Failed to load world from DB:", e);
    }
  }

  if (!world) {
    // Return SSE with no_world event instead of 404
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const data = `data: ${JSON.stringify({ type: "no_world" })}\n\n`;
        controller.enqueue(encoder.encode(data));
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
