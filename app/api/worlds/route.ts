import { NextRequest, NextResponse } from "next/server";
import { worldRepository } from "@/db/world-repository";

export const dynamic = "force-dynamic";

// GET /api/worlds - List all worlds
export async function GET() {
  try {
    const worlds = await worldRepository.listWorlds();
    return NextResponse.json({ worlds });
  } catch (error) {
    console.error("Failed to list worlds:", error);
    return NextResponse.json({ error: "Failed to list worlds" }, { status: 500 });
  }
}

// DELETE /api/worlds?id=xxx - Delete a world
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing world id" }, { status: 400 });
  }
  try {
    await worldRepository.deleteWorld(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete world:", error);
    return NextResponse.json({ error: "Failed to delete world" }, { status: 500 });
  }
}
