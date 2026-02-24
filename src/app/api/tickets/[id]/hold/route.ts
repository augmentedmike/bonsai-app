import { NextResponse } from "next/server";
import { getTicketById, updateTicket } from "@/db/data/tickets";
import { createSystemCommentAndBumpCount } from "@/db/data/comments";
import { logAuditEvent } from "@/db/data/audit";
import { getSetting } from "@/db/data/settings";
import { fireDispatch } from "@/lib/dispatch-agent";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tickets/[id]/hold - Put ticket on hold (suppresses all dispatches)
export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = body.reason || "On hold";
  const now = new Date().toISOString();

  await updateTicket(ticketId, {
    onHold: true,
    holdReason: reason,
    holdAt: now,
  });

  await createSystemCommentAndBumpCount(
    ticketId,
    `On hold: ${reason}`
  );

  const userName = await getSetting("user_name");
  await logAuditEvent({
    ticketId,
    event: "ticket_hold",
    actorType: "human",
    actorId: null,
    actorName: userName || "User",
    detail: reason,
  });

  return NextResponse.json({ ok: true, onHold: true, reason, holdAt: now });
}

// DELETE /api/tickets/[id]/hold - Remove hold and optionally resume dispatch
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  await updateTicket(ticketId, {
    onHold: false,
    holdReason: null,
    holdAt: null,
  });

  await createSystemCommentAndBumpCount(
    ticketId,
    `Hold removed — resuming`
  );

  const userName = await getSetting("user_name");
  await logAuditEvent({
    ticketId,
    event: "ticket_hold_removed",
    actorType: "human",
    actorId: null,
    actorName: userName || "User",
    detail: "Removed hold",
  });

  // Auto-dispatch agent to resume if requested
  if (body.dispatch !== false && ticket.state !== "shipped") {
    const origin = new URL(req.url).origin;
    fireDispatch(origin, ticketId, {
      commentContent: "Hold has been removed. Resume work on this ticket.",
    }, "unhold");
  }

  return NextResponse.json({ ok: true, onHold: false });
}
