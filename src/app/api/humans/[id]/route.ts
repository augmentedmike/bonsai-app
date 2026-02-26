import { NextResponse } from "next/server";
import { getHumanById, deleteHuman, setPassword } from "@/db/data/humans";
import { getCurrentHuman } from "@/lib/auth";

/**
 * DELETE /api/humans/[id]
 * Remove a human. Guards: cannot delete yourself; cannot delete the owner.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getCurrentHuman(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.isOwner) return NextResponse.json({ error: "Owner only" }, { status: 403 });

  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const target = await getHumanById(targetId);
  if (!target) return NextResponse.json({ error: "Human not found" }, { status: 404 });
  if (target.id === actor.id) return NextResponse.json({ error: "Cannot remove yourself" }, { status: 403 });
  if (target.isOwner) return NextResponse.json({ error: "Cannot remove the owner" }, { status: 403 });

  await deleteHuman(targetId);
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/humans/[id]
 * Reset a human's password (owner only, or the human themselves).
 * Body: { password: string }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getCurrentHuman(req);
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const targetId = Number(id);
  if (isNaN(targetId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // Only owner or the person themselves can change password
  if (!actor.isOwner && actor.id !== targetId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { password } = await req.json().catch(() => ({})) as { password?: string };
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  await setPassword(targetId, password);
  return NextResponse.json({ ok: true });
}
