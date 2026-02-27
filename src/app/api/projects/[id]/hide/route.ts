import { NextResponse } from "next/server";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";

/** POST /api/projects/[id]/hide — toggle hidden state */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const body = await req.json().catch(() => ({}));
  // Allow explicit set: { hidden: true/false }, or toggle if not provided
  let hidden: boolean;

  if (typeof body.hidden === "boolean") {
    hidden = body.hidden;
  } else {
    const row = db.select({ isHidden: projects.isHidden }).from(projects).where(eq(projects.id, projectId)).get();
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    hidden = !row.isHidden;
  }

  db.update(projects).set({ isHidden: hidden }).where(eq(projects.id, projectId)).run();

  return NextResponse.json({ ok: true, hidden });
}
