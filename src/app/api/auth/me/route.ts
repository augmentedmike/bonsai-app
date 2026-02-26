import { NextResponse } from "next/server";
import { getCurrentHuman } from "@/lib/auth";

/**
 * GET /api/auth/me
 * Returns the currently authenticated human or 401.
 */
export async function GET(req: Request) {
  const human = await getCurrentHuman(req);
  if (!human) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    id: human.id,
    name: human.name,
    email: human.email,
    isOwner: human.isOwner,
    avatarData: human.avatarData ?? null,
  });
}
