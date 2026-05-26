import { NextResponse } from "next/server";
import { usageTracker } from "@/lib/llm/usage-tracker";

export const dynamic = "force-dynamic";

// GET /api/usage - Return LLM usage stats
export async function GET() {
  const stats = usageTracker.getStats();
  const recent = usageTracker.getRecentCalls(20);
  return NextResponse.json({ stats, recent });
}

// DELETE /api/usage - Reset usage stats
export async function DELETE() {
  usageTracker.reset();
  return NextResponse.json({ success: true });
}
