import { NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { createCommentAndBumpCount } from "@/db/data/comments";
import { createAgentProjectMessage } from "@/db/data/project-messages";
import { getPersonaRaw, getGlobalPersonas } from "@/db/data/personas";
import { logAuditEvent } from "@/db/data/audit";
import { completeAgentRun, isChainedRun } from "@/db/data/agent-runs";
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

    // Agent→agent @mention chaining (max 1 hop to prevent infinite loops)
    const wasChained = personaId ? isChainedRun(ticketId, personaId) : false;
    if (!wasChained) {
      const projectPersonas = await getGlobalPersonas();
      const sorted = [...projectPersonas].sort((a, b) => b.name.length - a.name.length);
      for (const p of sorted) {
        if (p.id === personaId) continue; // don't self-dispatch
        const escapedName = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const namePattern = new RegExp(`@${escapedName}\\b`, 'i');
        if (namePattern.test(trimmed)) {
          console.log(`[agent-complete/inbox] Agent ${personaId} mentioned @${p.name} — dispatching (1-hop chain)`);
          fireDispatch(API_BASE, ticketId, {
            commentContent: trimmed,
            targetPersonaId: p.id,
            conversational: true,
            silent: true,
            noChain: true, // prevent further chaining
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

  // ── Agent @mention dispatch (1-hop max via noChain) ───────────────────
  const freshTicket = await getTicketById(ticketId);
  const wasChained = personaId ? isChainedRun(ticketId, personaId) : false;

  if (!wasChained && freshTicket) {
    const projectPersonas = await getGlobalPersonas();
    const sorted = [...projectPersonas].sort((a, b) => b.name.length - a.name.length);
    const mentioned = new Set<string>();

    for (const p of sorted) {
      if (p.id === personaId) continue; // no self-dispatch
      if (p.role === "operator") continue; // operator goes via inbox, not here
      const escapedName = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedRole = p.role ? p.role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
      const namePattern = new RegExp(`@${escapedName}\\b`, 'i');
      const rolePattern = escapedRole ? new RegExp(`@${escapedRole}\\b`, 'i') : null;
      if ((namePattern.test(trimmed) || (rolePattern && rolePattern.test(trimmed))) && !mentioned.has(p.id)) {
        mentioned.add(p.id);
        console.log(`[agent-complete] ${personaId} mentioned @${p.name} — dispatching (1-hop chain)`);
        fireDispatch(API_BASE, ticketId, {
          commentContent: trimmed,
          targetPersonaId: p.id,
          conversational: true,
          silent: true,
          noChain: true, // prevent the chained agent from chaining further
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
