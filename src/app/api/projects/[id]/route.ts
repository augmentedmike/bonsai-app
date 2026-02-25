import { NextResponse } from "next/server";
import { getProjectById } from "@/db/data/projects";

// GET /api/projects/[id] — return a single project by id
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProjectById(Number(id));

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}
