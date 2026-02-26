import { NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { createCommentAndBumpCount } from "@/db/data/comments";
import { createAgentProjectMessage } from "@/db/data/project-messages";
import { getPersonaRaw, getGlobalPersonas, getAllPersonasRaw } from "@/db/data/personas";
import { logAuditEvent } from "@/db/data/audit";
import { completeAgentRun, isChainedRun, getRunChainDepth } from "@/db/data/agent-runs";
import { getSetting } from "@/db/data/settings";
import { fireDispatch } from "@/lib/dispatch-agent";

const API_BASE = process.env.API_BASE || "http://localhost:3080";

// Called by the agent wrapper script when claude -p finishes.
// Posts the agent's final output as a chat comment.
// Documents are saved separately via the save-document.sh tool → POST /api/tickets/[id]/documents.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);
  const { personaId, content, documentId, costUsd, inputTokens, outputTokens, cacheReadTokens, sessionId, modelUsage } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "empty output" }, { status: 400 });
  }

  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  const trimmed = content.trim();

  const completingPersona = personaId
    ? await getPersonaRaw(personaId)
    : null;
  const agentName = completingPersona?.name ?? "Agent";

  // ── Inbox ticket → write to project_messages instead ───
  const isInbox = ticket.title === "[Inbox]";
  if (isInbox && ticket.projectId) {
    await createAgentProjectMessage(ticket.projectId, personaId, trimmed);

    // Agent→agent @mention chaining — allow up to 3 hops in project chat.
    // Search ALL personas so @name mentions resolve even for project-specific personas.
    const MAX_INBOX_DEPTH = 3;
    const currentDepth = personaId ? getRunChainDepth(ticketId, personaId) : MAX_INBOX_DEPTH;
    if (currentDepth < MAX_INBOX_DEPTH) {
      const allPersonas = await getAllPersonasRaw();
      const sorted = [...allPersonas].sort((a, b) => b.name.length - a.name.length);
      const dispatched = new Set<string>(); // dedupe by role/id
      for (const p of sorted) {
        if (p.id === personaId) continue; // don't self-dispatch
        const escapedName = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedRole = p.role ? p.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
        const namePattern = new RegExp(`@${escapedName}\\b`, 'i');
        const rolePattern = escapedRole ? new RegExp(`@${escapedRole}\\b`, 'i') : null;
        if (namePattern.test(trimmed) || (rolePattern && rolePattern.test(trimmed))) {
          // Resolve: global persona → dispatch by ID; project persona → dispatch by role
          const isGlobal = p.id.startsWith('g-');
          const dispatchKey = isGlobal ? p.id : (p.role ?? p.id);
          if (dispatched.has(dispatchKey)) continue;
          dispatched.add(dispatchKey);
          const dispatchTarget = isGlobal
            ? { targetPersonaId: p.id }
            : { targetRole: p.role ?? undefined };
          console.log(`[agent-complete/inbox] Agent ${personaId} mentioned @${p.name} — dispatching (depth ${currentDepth + 1}/${MAX_INBOX_DEPTH}, ${isGlobal ? 'by id' : 'by role: ' + p.role})`);
          fireDispatch(API_BASE, ticketId, {
            commentContent: trimmed,
            ...dispatchTarget,
            conversational: true,
            silent: true,
            chainDepth: currentDepth + 1,
          }, `agent-complete/inbox/@${p.name}`);
        }
      }
    }

    if (personaId) {
      await completeAgentRun(ticketId, personaId, "completed", undefined, { costUsd, inputTokens, outputTokens, cacheReadTokens, sessionId, modelUsage });
    }

    await logAuditEvent({
      ticketId,
      event: "agent_completed",
      actorType: "agent",
      actorId: personaId,
      actorName: agentName,
      detail: `${agentName} completed project chat response`,
      metadata: { role: completingPersona?.role || "unknown", inbox: true },
    });

    return NextResponse.json({ ok: true });
  }

  // ── Post chat comment (normal ticket flow) ─────────────
  await createCommentAndBumpCount({
    ticketId,
    authorType: "agent",
    personaId: personaId || null,
    content: trimmed,
    documentId: documentId || null,
  });

  // ── Agent @mention dispatch (1-hop max for regular tickets) ───────────
  const freshTicket = await getTicketById(ticketId);
  const ticketChainDepth = personaId ? getRunChainDepth(ticketId, personaId) : 1;

  if (ticketChainDepth < 1 && freshTicket) {
    const allPersonas = await getAllPersonasRaw();
    const sorted = [...allPersonas].sort((a, b) => b.name.length - a.name.length);
    const dispatched = new Set<string>();

    for (const p of sorted) {
      if (p.id === personaId) continue; // no self-dispatch
      if (p.role === "operator") continue; // operator goes via inbox, not here
      const escapedName = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedRole = p.role ? p.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
      const namePattern = new RegExp(`@${escapedName}\\b`, 'i');
      const rolePattern = escapedRole ? new RegExp(`@${escapedRole}\\b`, 'i') : null;
      if (namePattern.test(trimmed) || (rolePattern && rolePattern.test(trimmed))) {
        const isGlobal = p.id.startsWith('g-');
        const dispatchKey = isGlobal ? p.id : (p.role ?? p.id);
        if (dispatched.has(dispatchKey)) continue;
        dispatched.add(dispatchKey);
        const dispatchTarget = isGlobal
          ? { targetPersonaId: p.id }
          : { targetRole: p.role ?? undefined };
        console.log(`[agent-complete] ${personaId} mentioned @${p.name} — dispatching (depth 1)`);
        fireDispatch(API_BASE, ticketId, {
          commentContent: trimmed,
          ...dispatchTarget,
          conversational: true,
          silent: true,
          chainDepth: 1,
        }, `agent-complete/@${p.name}`);
      }
    }
  }

  // ── Mark agent run completed ────────────────────────────
  if (personaId) {
    await completeAgentRun(ticketId, personaId, "completed", undefined, { costUsd, inputTokens, outputTokens, cacheReadTokens, sessionId, modelUsage });
  }

  // ── Audit ──────────────────────────────────────────────
  await logAuditEvent({
    ticketId,
    event: "agent_completed",
    actorType: "agent",
    actorId: personaId,
    actorName: agentName,
    detail: `${agentName} completed work`,
    metadata: { role: completingPersona?.role || "unknown" },
  });

  return NextResponse.json({ ok: true });
}
