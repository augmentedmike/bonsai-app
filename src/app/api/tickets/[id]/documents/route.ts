/**
 * /api/tickets/[id]/documents — DEPRECATED
 *
 * The ticket_documents system has been removed. Research and implementation
 * plans are now stored as tagged ticket_attachments.
 *
 * Tag mapping (old type → new tag):
 *   research          → research-doc
 *   implementation_plan → implementation-plan
 *   design            → design-doc
 *
 * Use /api/tickets/[id]/attachments instead.
 */
import { NextResponse } from "next/server";
import { getAttachmentsByTag, createAttachment, deleteAttachment } from "@/db/data/attachments";
import { getTicketById, updateTicket } from "@/db/data/tickets";
import { getPersonaRaw } from "@/db/data/personas";
import { logAuditEvent } from "@/db/data/audit";
import { createCommentAndBumpCount } from "@/db/data/comments";
import { fireDispatch } from "@/lib/dispatch-agent";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const TAG_MAP: Record<string, string> = {
  research: "research-doc",
  implementation_plan: "implementation-plan",
  design: "design-doc",
};

const TAG_LABELS: Record<string, string> = {
  "research-doc": "Research document",
  "implementation-plan": "Implementation plan",
  "design-doc": "Design document",
};

function encodeContent(content: string): string {
  return `data:text/markdown;base64,${Buffer.from(content).toString("base64")}`;
}

function decodeContent(dataUrl: string): string {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (match) return Buffer.from(match[1], "base64").toString("utf-8");
  return dataUrl;
}

// GET /api/tickets/[id]/documents — returns tagged attachments in legacy format
export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);

  const [researchAtts, planAtts, designAtts] = await Promise.all([
    getAttachmentsByTag(ticketId, "research-doc"),
    getAttachmentsByTag(ticketId, "implementation-plan"),
    getAttachmentsByTag(ticketId, "design-doc"),
  ]);

  // Return in legacy shape so old UI code doesn't break
  const documents = [
    ...researchAtts.map(a => ({ id: a.id, ticketId, type: "research", content: decodeContent(a.data), version: 1, tag: a.tag, createdAt: a.createdAt })),
    ...planAtts.map(a => ({ id: a.id, ticketId, type: "implementation_plan", content: decodeContent(a.data), version: 1, tag: a.tag, createdAt: a.createdAt })),
    ...designAtts.map(a => ({ id: a.id, ticketId, type: "design", content: decodeContent(a.data), version: 1, tag: a.tag, createdAt: a.createdAt })),
  ];

  return NextResponse.json({ documents });
}

// POST /api/tickets/[id]/documents — saves as tagged attachment
export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);
  const { type: typeParam, content, personaId } = await req.json();

  const tag = TAG_MAP[typeParam];
  if (!tag) {
    return NextResponse.json({ error: `Invalid type. Must be: ${Object.keys(TAG_MAP).join(", ")}` }, { status: 400 });
  }

  const trimmed = content?.trim();
  if (!trimmed) return NextResponse.json({ error: "Content is required" }, { status: 400 });

  const ticket = await getTicketById(ticketId);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const persona = personaId ? await getPersonaRaw(personaId) : null;
  const agentName = persona?.name ?? "Unknown";
  const now = new Date().toISOString();

  // Save as tagged attachment
  const filename = `${tag}-${ticketId}-${Date.now()}.md`;
  await createAttachment({
    ticketId,
    filename,
    mimeType: "text/markdown",
    data: encodeContent(trimmed),
    tag,
    createdByType: personaId ? "sim" : "human",
    createdById: personaId || null,
  });

  // Update ticket state fields
  if (typeParam === "research" && !ticket.researchCompletedAt) {
    await updateTicket(ticketId, { researchCompletedAt: now, researchCompletedBy: personaId || null });
    const origin = process.env.API_BASE || `http://localhost:${process.env.PORT || 3090}`;
    fireDispatch(origin, ticketId, {
      commentContent: "Research complete. Creating implementation plan based on findings.",
      targetRole: "developer",
      silent: false,
      urgent: true,
    }, "research-complete");
  } else if (typeParam === "implementation_plan" && !ticket.planCompletedAt) {
    await updateTicket(ticketId, { planCompletedAt: now, planCompletedBy: personaId || null });
  }

  const label = TAG_LABELS[tag] ?? tag;
  await createCommentAndBumpCount({
    ticketId,
    authorType: personaId ? "sim" : "human",
    personaId: personaId || null,
    content: `${label} saved.`,
  });

  await logAuditEvent({
    ticketId,
    event: "document_created",
    actorType: personaId ? "sim" : "human",
    actorId: personaId,
    actorName: agentName,
    detail: `Saved ${label.toLowerCase()} as attachment (tag: ${tag})`,
    metadata: { tag, type: typeParam },
  });

  return NextResponse.json({ ok: true, version: 1, type: typeParam, tag });
}

// DELETE /api/tickets/[id]/documents?type=research
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ticketId = Number(id);
  const { searchParams } = new URL(req.url);
  const typeParam = searchParams.get("type");

  const tag = TAG_MAP[typeParam ?? ""];
  if (!tag) {
    return NextResponse.json({ error: `Invalid type. Must be: ${Object.keys(TAG_MAP).join(", ")}` }, { status: 400 });
  }

  const atts = await getAttachmentsByTag(ticketId, tag);
  await Promise.all(atts.map(a => deleteAttachment(a.id)));

  await logAuditEvent({
    ticketId,
    event: "document_deleted",
    actorType: "human",
    actorName: "System",
    detail: `Deleted ${TAG_LABELS[tag]?.toLowerCase() ?? tag} attachments`,
    metadata: { tag, type: typeParam },
  });

  if (typeParam === "research") {
    await updateTicket(ticketId, {
      researchCompletedAt: null, researchCompletedBy: null,
      researchApprovedAt: null, researchApprovedBy: null,
      lastAgentActivity: null, assigneeId: null,
    });
  } else if (typeParam === "implementation_plan") {
    await updateTicket(ticketId, {
      planCompletedAt: null, planCompletedBy: null,
      planApprovedAt: null, planApprovedBy: null,
      lastAgentActivity: null, assigneeId: null,
    });
  }

  return NextResponse.json({ ok: true });
}
