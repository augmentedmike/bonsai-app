import { NextResponse } from "next/server";
import { getProjectMessages, createProjectMessage } from "@/db/data/project-messages";
import { getGlobalPersonas } from "@/db/data/personas";
import { getHumans } from "@/db/data/humans";
import { createTicket, getTicketsByProject, updateTicket } from "@/db/data/tickets";
import { createProject } from "@/db/data/projects";
import { fireDispatch } from "@/lib/dispatch-agent";
import { getCurrentHuman } from "@/lib/auth";
import { db } from "@/db";
import { agentRuns, comments, personas, projects } from "@/db/schema";
import { eq, and, isNull, desc, inArray } from "drizzle-orm";

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

  // Sim responses from the operator land in ticket comments, not project_messages.
  // Fetch them and merge into the chat stream so they appear in the UI.
  let simMessages: typeof messages = [];
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

    // Fetch sim comments from the inbox ticket (operator replies)
    const inboxComments = db
      .select()
      .from(comments)
      .where(and(eq(comments.ticketId, inbox.id), eq(comments.authorType, "sim")))
      .orderBy(desc(comments.createdAt))
      .limit(limit)
      .all();

    if (inboxComments.length > 0) {
      const personaIds = [...new Set(inboxComments.filter((c) => c.personaId).map((c) => c.personaId!))];
      const personaRows = personaIds.length > 0
        ? db.select().from(personas).where(inArray(personas.id, personaIds)).all()
        : [];
      const personaMap = new Map(personaRows.map((p) => [p.id, p]));

      simMessages = inboxComments.map((c) => {
        const persona = c.personaId ? personaMap.get(c.personaId) : null;
        return {
          id: `c-${c.id}` as unknown as number,
          projectId,
          authorType: "sim" as const,
          author: persona
            ? {
                name: persona.name,
                avatarUrl: persona.avatar ? `/api/personas/${persona.id}/avatar` : undefined,
                color: persona.color,
                role: persona.role || undefined,
              }
            : { name: "Sim" },
          content: c.content,
          attachments: undefined,
          createdAt: c.createdAt,
        };
      });
    }
  }

  // Merge human messages + sim responses, sorted oldest-first
  const allMessages = [...messages, ...simMessages].sort((a, b) =>
    (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  );

  const humanList = await getHumans();
  const humans = humanList.map((h) => ({ id: h.id, name: h.name }));

  return NextResponse.json({ messages: allMessages, activeAgents, humans });
}

/** POST — save message and dispatch to @mentioned persona, or @operator by default */
export async function POST(req: Request) {
  const { content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "empty message" }, { status: 400 });
  }

  const projectId = await ensureGlobalProject();

  // Use authenticated human's id for authorId
  const human = await getCurrentHuman(req);
  const authorId = human?.id ?? 1;

  const msg = await createProjectMessage({
    projectId,
    authorType: "human",
    authorId,
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

  // @operator mention → route to operator explicitly (@team is disabled)
  const isOperator = /@operator\b/i.test(trimmed);
  const inboxTicketId = await ensureGlobalInboxTicket(projectId);

  if (!isOperator && mentionedIds.length > 0) {
    for (const personaId of mentionedIds) {
      fireDispatch(API_BASE, inboxTicketId, {
        commentContent: trimmed,
        targetPersonaId: personaId,
        conversational: true,
        silent: true,
      }, "bonsai-chat/@mention");
    }
  } else {
    // No persona mention (or explicit @operator) — @operator owns it
    // Human mentions (@Mike, @Ryan) are stored only, no dispatch
    fireDispatch(API_BASE, inboxTicketId, {
      commentContent: trimmed,
      targetRole: "operator",
      conversational: true,
      silent: true,
    }, "bonsai-chat/operator");
  }

  return NextResponse.json({ ok: true, message: msg });
}
