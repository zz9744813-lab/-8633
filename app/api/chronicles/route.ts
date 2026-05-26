import { NextRequest, NextResponse } from "next/server";
import { chronicleRepo, ChronicleFilter } from "@/db/chronicle-repository";

export const dynamic = "force-dynamic";

// GET /api/chronicles?worldId=xxx&year=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const worldId = searchParams.get("worldId");
    const year = searchParams.get("year");
    const season = searchParams.get("season");
    const type = searchParams.get("type");
    const limit = searchParams.get("limit");

    if (!worldId) {
      return NextResponse.json(
        { error: "worldId is required" },
        { status: 400 }
      );
    }

    const filter: ChronicleFilter = {
      worldId,
      year: year ? parseInt(year) : undefined,
      season: season || undefined,
      type: (type as any) || undefined,
      limit: limit ? parseInt(limit) : undefined,
    };

    const chronicles = await chronicleRepo.list(filter);
    return NextResponse.json({ chronicles });
  } catch (error) {
    console.error("Failed to fetch chronicles:", error);
    return NextResponse.json(
      { error: "Failed to fetch chronicles" },
      { status: 500 }
    );
  }
}
