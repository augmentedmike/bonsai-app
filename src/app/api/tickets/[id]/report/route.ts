import { NextResponse } from "next/server";
import { getTicketById, createAgentComment, updateTicket, getPersonaRaw, logAuditEvent, touchAgentRunReport } from "@/db/data";
import { canPerformAction, stateMachineError } from "@/lib/ticket-state-machine";

// Called by agents mid-run to post progress updates to the ticket thread.
// Lighter than agent-complete — just posts a comment, no document logic.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);
  const { personaId, content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  // State machine: agents can only report on active tickets
  const actionCheck = canPerformAction(ticket.state, "report", "agent");
  if (!actionCheck.allowed) {
    return NextResponse.json(stateMachineError(actionCheck, ticketId), { status: 422 });
  }

  // Post agent comment (this function already bumps comment count)
  await createAgentComment(ticketId, personaId, content.trim());

  // Update lastAgentActivity separately
  await updateTicket(ticketId, {
    lastAgentActivity: new Date().toISOString(),
  });

  // Touch the active agent run's lastReportAt + store message
  if (personaId) {
    await touchAgentRunReport(ticketId, personaId, content.trim());
  }

  const persona = personaId ? await getPersonaRaw(personaId) : null;

  await logAuditEvent({
    ticketId,
    event: "agent_progress",
    actorType: "sim",
    actorId: personaId,
    actorName: persona?.name ?? "Sim",
    detail: content.trim().slice(0, 200),
  });

  return NextResponse.json({ ok: true });
}
