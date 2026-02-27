import { db, asAsync } from "./_driver";
import { personas, tickets, comments } from "../schema";
import { eq, desc, inArray, isNull, and } from "drizzle-orm";

/** Lightweight summary — only what the sidebar needs. No comment queries, no avatar blobs. */
export function getWorkersSummary() {
  // Explicitly select only what we need — exclude `avatar` blob column
  const allPersonas = db
    .select({
      id: personas.id,
      name: personas.name,
      slug: personas.slug,
      role: personas.role,
      color: personas.color,
      // Use presence flag so we can build URL without loading the blob
      hasAvatar: personas.avatar,
    })
    .from(personas)
    .where(and(isNull(personas.projectId), isNull(personas.deletedAt)))
    .all();

  const now = new Date();
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

  const workers = allPersonas.map((p) => {
    const assignedTickets = db
      .select({ id: tickets.id, lastAgentActivity: tickets.lastAgentActivity })
      .from(tickets)
      .where(eq(tickets.assigneeId, p.id))
      .all();

    const isActive = assignedTickets.some(
      (t) => t.lastAgentActivity && t.lastAgentActivity > thirtyMinAgo
    );

    return {
      id: p.id,
      name: p.name,
      role: p.role || "developer",
      color: p.color,
      // Return URL reference instead of raw base64 — keeps payload small
      avatarData: p.hasAvatar ? `/api/personas/${p.id}/avatar` : null,
      isActive,
    };
  });

  workers.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return asAsync(workers);
}

export function getWorkerActivity() {
  // Global team: always return personas with project_id IS NULL
  // Exclude avatar blob — use URL reference to keep memory usage low
  const allPersonas = db
    .select({
      id: personas.id,
      name: personas.name,
      slug: personas.slug,
      role: personas.role,
      color: personas.color,
      hasAvatar: personas.avatar,
    })
    .from(personas)
    .where(and(isNull(personas.projectId), isNull(personas.deletedAt)))
    .all();

  const personaMap = new Map(allPersonas.map((p) => [p.id, p]));
  const now = new Date();
  const thirtyMinAgo = new Date(
    now.getTime() - 30 * 60 * 1000
  ).toISOString();

  const workers = allPersonas.map((p) => {
    const assignedTickets = db
      .select()
      .from(tickets)
      .where(eq(tickets.assigneeId, p.id))
      .all();

    const isActive = assignedTickets.some(
      (t) => t.lastAgentActivity && t.lastAgentActivity > thirtyMinAgo
    );

    const ticketIds = assignedTickets.map((t) => t.id);
    const allTicketComments =
      ticketIds.length > 0
        ? db
            .select()
            .from(comments)
            .where(inArray(comments.ticketId, ticketIds))
            .orderBy(desc(comments.createdAt))
            .limit(50)
            .all()
        : [];

    const ticketTitleMap = new Map(
      assignedTickets.map((t) => [t.id, t.title])
    );

    const activityFeed = [
      ...allTicketComments.map((c) => {
        const author = c.personaId ? personaMap.get(c.personaId) : null;
        return {
          kind: "comment" as const,
          id: `c-${c.id}`,
          ticketId: c.ticketId,
          ticketTitle: ticketTitleMap.get(c.ticketId) || c.ticketId,
          authorType: c.authorType as "human" | "sim",
          authorName:
            author?.name ||
            (c.authorType === "human" ? "You" : "Sim"),
          authorRole: author?.role || null,
          authorColor: author?.color || null,
          // URL reference instead of blob — prevents memory accumulation in streaming
          authorAvatar: author
            ? (author.hasAvatar ? `/api/personas/${author.id}/avatar` : null)
            : null,
          isSelf: c.personaId === p.id,
          content: c.content,
          createdAt: c.createdAt || "",
        };
      }),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      color: p.color,
      // URL reference instead of raw base64 blob
      avatar: p.hasAvatar ? `/api/personas/${p.id}/avatar` : null,
      role: p.role || "developer",
      isActive,
      stats: {
        assignedTickets: assignedTickets.length,
        activeTickets: assignedTickets.filter((t) => t.state !== "shipped")
          .length,
        doneTickets: assignedTickets.filter((t) => t.state === "shipped")
          .length,
        totalComments: allTicketComments.filter(
          (c) => c.personaId === p.id
        ).length,
      },
      tickets: assignedTickets.map((t) => ({
        id: t.id,
        title: t.title,
        state: t.state,
        type: t.type,
        lastAgentActivity: t.lastAgentActivity,
      })),
      activityFeed,
    };
  });

  workers.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return asAsync(workers);
}
