import { NextRequest, NextResponse } from "next/server";
import { chronicleRepo } from "@/db/chronicle-repository";

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

    const filter: {
      worldId: string;
      year?: number;
      season?: string;
      type?: string;
      limit?: number;
    } = { worldId };

    if (year) filter.year = parseInt(year);
    if (season) filter.season = season;
    if (type) filter.type = type;
    if (limit) filter.limit = parseInt(limit);

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
