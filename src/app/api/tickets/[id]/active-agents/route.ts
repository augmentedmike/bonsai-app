import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentRuns, personas } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// GET /api/tickets/[id]/active-agents - Get currently running agents for a ticket
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);

  // Find agent runs that are still in progress (status = "running")
  const activeRuns = db
    .select({
      runId: agentRuns.id,
      personaId: agentRuns.personaId,
      phase: agentRuns.phase,
      status: agentRuns.status,
      startedAt: agentRuns.startedAt,
      personaName: personas.name,
      personaRole: personas.role,
      personaColor: personas.color,
    })
    .from(agentRuns)
    .leftJoin(personas, eq(agentRuns.personaId, personas.id))
    .where(
      and(
        eq(agentRuns.ticketId, ticketId),
        eq(agentRuns.status, "running")
      )
    )
    .orderBy(agentRuns.startedAt)
    .all();

  const agents = activeRuns.map((run) => ({
    id: run.personaId || `run-${run.runId}`,
    name: run.personaName || "Agent",
    role: run.personaRole || "worker",
    color: run.personaColor || "#6366f1",
    status: run.status || `Working on ${run.phase} phase`,
    phase: run.phase,
  }));

  return NextResponse.json({ agents });
}
