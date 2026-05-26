import { NextRequest, NextResponse } from "next/server";
import { getWorld } from "@/lib/agent";

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  try {
    const { lexiconRepo } = await import("@/db/lexicon-repository");
    const words = await lexiconRepo.getAgentWords(agentId);
    return NextResponse.json({ words });
  } catch (e) {
    return NextResponse.json({ words: [] });
  }
}
