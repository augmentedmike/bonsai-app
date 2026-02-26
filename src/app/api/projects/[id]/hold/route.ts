import { NextResponse } from "next/server";
import { db } from "@/db/index";
import { tickets } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";

// POST /api/projects/[id]/hold — put all non-shipped tickets on hold
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const now = new Date().toISOString();
  db.update(tickets)
    .set({ onHold: true, holdReason: "Project on hold", holdAt: now })
    .where(and(eq(tickets.projectId, projectId), ne(tickets.state, "shipped")))
    .run();

  return NextResponse.json({ ok: true });
}

// DELETE /api/projects/[id]/hold — remove hold from all tickets
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  db.update(tickets)
    .set({ onHold: false, holdReason: null, holdAt: null })
    .where(eq(tickets.projectId, projectId))
    .run();

  return NextResponse.json({ ok: true });
}
