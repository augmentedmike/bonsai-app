import { NextResponse } from "next/server";
import { getProjectMessages, createProjectMessage } from "@/db/data/project-messages";
import { getGlobalPersonas } from "@/db/data/personas";
import { createTicket, getTicketsByProject, updateTicket } from "@/db/data/tickets";
import { createProject } from "@/db/data/projects";
import { fireDispatch } from "@/lib/dispatch-agent";
import { db } from "@/db";
import { agentRuns, personas, projects } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const API_BASE = process.env.API_BASE || "http://localhost:3080";
const GLOBAL_SLUG = "__global__";

/** Get or create the hidden system project that backs the bonsai-wide chat */
async function ensureGlobalProject(): Promise<number> {
  const existing = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.slug, GLOBAL_SLUG))
    .get();
  if (existing) return existing.id;

  const proj = await createProject({
    name: "[Global]",
    slug: GLOBAL_SLUG,
    visibility: "private",
    description: "System project backing the bonsai-wide chat. Do not delete.",
  });

  // Soft-delete so it never appears in the projects list
  await updateProject(proj.id);

  return proj.id;
}

async function updateProject(id: number) {
  db.update(projects)
    .set({ deletedAt: new Date().toISOString() } as Record<string, string>)
    .where(eq(projects.id, id))
    .run();
}

/** Get or create the hidden [Global Inbox] ticket used as dispatch target */
async function ensureGlobalInboxTicket(projectId: number): Promise<number> {
  const existing = await getTicketsByProject(projectId, "[Global Inbox]");
  if (existing) return existing.id;

  const ticket = await createTicket({
    title: "[Global Inbox]",
    type: "chore",
    state: "building",
    description: "Hidden inbox ticket for bonsai-wide chat dispatch.",
    priority: 0,
    projectId,
  });

  await updateTicket(ticket.id, { deletedAt: new Date().toISOString() });

  return ticket.id;
}

/** GET — fetch global chat messages + typing indicators */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit")) || 100;

  const projectId = await ensureGlobalProject();
  const messages = await getProjectMessages(projectId, limit);

  const inbox = await getTicketsByProject(projectId, "[Global Inbox]");
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
        id: r.personaId || "agent",
        name: r.personaName || "Sim",
        color: r.personaColor || "#6366f1",
        avatarUrl: r.personaAvatar && r.personaId ? `/api/personas/${r.personaId}/avatar` : undefined,
      });
    }
  }

  return NextResponse.json({ messages, activeAgents });
}

/** POST — save message and dispatch to @mentioned persona, or @operator by default */
export async function POST(req: Request) {
  const { content, authorId } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const projectId = await ensureGlobalProject();

  const msg = await createProjectMessage({
    projectId,
    authorType: "human",
    authorId: authorId || 1,
    content: content.trim(),
  });

  const trimmed = content.trim();
  const allPersonas = await getGlobalPersonas();
  const sorted = [...allPersonas].sort((a, b) => b.name.length - a.name.length);
  const mentionedIds: string[] = [];

  for (const p of sorted) {
    const pattern = new RegExp(`@${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(trimmed) && !mentionedIds.includes(p.id)) {
      mentionedIds.push(p.id);
    }
  }

  const isTeam = /@team\b/i.test(trimmed);
  const inboxTicketId = await ensureGlobalInboxTicket(projectId);

  if (isTeam) {
    fireDispatch(API_BASE, inboxTicketId, {
      commentContent: trimmed,
      team: true,
      silent: true,
      conversational: true,
    }, "bonsai-chat/@team");
  } else if (mentionedIds.length > 0) {
    for (const personaId of mentionedIds) {
      fireDispatch(API_BASE, inboxTicketId, {
        commentContent: trimmed,
        targetPersonaId: personaId,
        conversational: true,
        silent: true,
      }, "bonsai-chat/@mention");
    }
  } else {
    // No @mention — @operator owns it
    fireDispatch(API_BASE, inboxTicketId, {
      commentContent: trimmed,
      targetRole: "operator",
      conversational: true,
      silent: true,
    }, "bonsai-chat/operator");
  }

  return NextResponse.json({ ok: true, message: msg });
}
