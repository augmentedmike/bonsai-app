import { NextResponse } from "next/server";
import { getTicketById, updateTicket } from "@/db/data/tickets";
import { createSystemCommentAndBumpCount } from "@/db/data/comments";
import { logAuditEvent } from "@/db/data/audit";
import { getSetting } from "@/db/data/settings";
import { fireDispatch } from "@/lib/dispatch-agent";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// POST /api/tickets/[id]/block - Flag ticket as blocked
export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = body.reason || "Blocked — needs human intervention";
  const now = new Date().toISOString();

  await updateTicket(ticketId, {
    blocked: true,
    blockedReason: reason,
    blockedAt: now,
  });

  await createSystemCommentAndBumpCount(
    ticketId,
    `Blocked: ${reason}`
  );

  const userName = await getSetting("user_name");
  await logAuditEvent({
    ticketId,
    event: "ticket_blocked",
    actorType: body.actorType || "sim",
    actorId: body.actorId || null,
    actorName: body.actorName || userName || "System",
    detail: reason,
  });

  return NextResponse.json({ ok: true, blocked: true, reason, blockedAt: now });
}

// DELETE /api/tickets/[id]/block - Unblock ticket and optionally re-dispatch
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  await updateTicket(ticketId, {
    blocked: false,
    blockedReason: null,
    blockedAt: null,
  });

  await createSystemCommentAndBumpCount(
    ticketId,
    `Unblocked — resuming work`
  );

  const userName = await getSetting("user_name");
  await logAuditEvent({
    ticketId,
    event: "ticket_unblocked",
    actorType: "human",
    actorId: null,
    actorName: userName || "User",
    detail: "Removed blocked flag",
  });

  // Auto-dispatch agent to resume if requested
  if (body.dispatch !== false && ticket.state !== "shipped") {
    const origin = new URL(req.url).origin;
    fireDispatch(origin, ticketId, {
      commentContent: "Blocker has been resolved. Resume work on this ticket.",
    }, "unblock");
  }

  return NextResponse.json({ ok: true, blocked: false });
}
