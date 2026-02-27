import { NextResponse } from "next/server";
import { getProjectMessages, createProjectMessage } from "@/db/data/project-messages";
import { getGlobalPersonas } from "@/db/data/personas";
import { getProjectById } from "@/db/data/projects";
import { createTicket, getTicketsByProject, updateTicket } from "@/db/data/tickets";
import { fireDispatch } from "@/lib/dispatch-agent";
import { getCurrentHuman } from "@/lib/auth";
import { db } from "@/db";
import { agentRuns, personas } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const API_BASE = process.env.API_BASE || "http://localhost:3080";

/** GET — fetch project chat messages */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit")) || 100;

  const messages = await getProjectMessages(projectId, limit);

  // Include active agent runs on the inbox ticket so the client can restore
  // the typing indicator after a page refresh without a separate request.
  const inbox = await getTicketsByProject(projectId, "[Inbox]");
  const activeAgents: Array<{ id: string; name: string; color: string; avatarUrl?: string }> = [];
  if (inbox) {
    const runs = db
      .select({
        personaId: agentRuns.personaId,
        personaName: personas.name,
        personaColor: personas.color,
        personaAvatar: personas.avatar,
      })
      .from(agentRuns)
      .leftJoin(personas, eq(agentRuns.personaId, personas.id))
      .where(and(eq(agentRuns.ticketId, inbox.id), isNull(agentRuns.endedAt)))
      .all();
    for (const r of runs) {
      activeAgents.push({
        id: r.personaId || "sim",
        name: r.personaName || "Sim",
        color: r.personaColor || "#6366f1",
        avatarUrl: r.personaAvatar && r.personaId ? `/api/personas/${r.personaId}/avatar` : undefined,
      });
    }
  }

  return NextResponse.json({ messages, activeAgents });
}

/** POST — create a human message, extract @mentions, dispatch agent */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);
  const { content, attachments } = await req.json();

  if (!content?.trim() && (!attachments || attachments.length === 0)) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Use authenticated human's id for authorId
  const human = await getCurrentHuman(req);
  const authorId = human?.id ?? 1;

  // Save human message with attachments
  const msg = await createProjectMessage({
    projectId,
    authorType: "human",
    authorId,
    content: content?.trim() || "",
    attachments: attachments && attachments.length > 0 ? JSON.stringify(attachments) : null,
  });

  // Extract @mentions from content
  const projectPersonas = await getGlobalPersonas();
  const trimmed = content.trim();

  // Find mentioned personas (by name or role) — excludes @team (disabled) and humans
  const sorted = [...projectPersonas].sort((a, b) => b.name.length - a.name.length);
  const mentionedIds: string[] = [];

  for (const p of sorted) {
    const pattern = new RegExp(`@${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(trimmed) && !mentionedIds.includes(p.id)) {
      mentionedIds.push(p.id);
    }
  }

  // @operator mention → always route to operator (same as no-mention fallback)
  const isOperator = /@operator\b/i.test(trimmed);

  // Dispatch via inbox ticket — route to mentioned personas, or @operator by default
  // @team is disabled — human mentions (@Mike, @Ryan) are stored only, no dispatch
  const inboxTicketId = await ensureInboxTicket(projectId);

  if (!isOperator && mentionedIds.length > 0) {
    for (const personaId of mentionedIds) {
      fireDispatch(API_BASE, inboxTicketId, {
        commentContent: trimmed,
        targetPersonaId: personaId,
        conversational: true,
        silent: true,
      }, `project-chat/@mention`);
    }
  } else {
    // No persona mention (or explicit @operator) — route to @operator
    fireDispatch(API_BASE, inboxTicketId, {
      commentContent: trimmed,
      targetRole: "operator",
      conversational: true,
      silent: true,
    }, "project-chat/operator");
  }

  return NextResponse.json({ ok: true, message: msg });
}

/**
 * Ensure an inbox ticket exists for the project.
 * Hidden chore used as a dispatch target for project-level chat.
 * Has deletedAt set so it doesn't appear on the board.
 */
async function ensureInboxTicket(projectId: number): Promise<number> {
  const existing = await getTicketsByProject(projectId, "[Inbox]");
  if (existing) {
    return existing.id;
  }

  const ticket = await createTicket({
    title: "[Inbox]",
    type: "chore",
    state: "building",
    description: "Hidden inbox ticket for project-level chat dispatch.",
    priority: 0,
    projectId,
  });

  // Soft-delete so it doesn't appear on the board
  await updateTicket(ticket.id, { deletedAt: new Date().toISOString() });

  return ticket.id;
}
