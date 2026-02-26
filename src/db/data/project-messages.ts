import { db, asAsync } from "./_driver";
import { projectMessages, personas, settings, humans } from "../schema";
import { eq, desc, inArray } from "drizzle-orm";

/** Fetch project messages with author enrichment */
export function getProjectMessages(projectId: number, limit: number = 100) {
  const rows = db
    .select()
    .from(projectMessages)
    .where(eq(projectMessages.projectId, projectId))
    .orderBy(desc(projectMessages.createdAt))
    .limit(limit)
    .all()
    .reverse(); // oldest first for chat display

  // Batch-fetch all humans referenced by human messages
  const humanIds = [...new Set(rows.filter((r) => r.authorType === "human" && r.authorId).map((r) => r.authorId!))];
  const humanMap = new Map<number, typeof humans.$inferSelect>();
  if (humanIds.length > 0) {
    const humanRows = db.select().from(humans).where(inArray(humans.id, humanIds)).all();
    for (const h of humanRows) humanMap.set(h.id, h);
  }

  // Fallback: get user name and avatar from settings (for old messages without a human record)
  let fallbackName: string | undefined;
  let fallbackAvatar: string | undefined;
  if (humanIds.some((id) => !humanMap.has(id))) {
    fallbackName =
      db.select({ value: settings.value }).from(settings).where(eq(settings.key, "user_name")).get()?.value ?? "User";
    fallbackAvatar =
      db.select({ value: settings.value }).from(settings).where(eq(settings.key, "user_avatar_url")).get()?.value ?? undefined;
  }

  // Batch-fetch all personas referenced by agent messages
  const personaIds = [...new Set(rows.filter((r) => r.authorType === "sim" && r.personaId).map((r) => r.personaId!))];
  const personaMap = new Map<string, typeof personas.$inferSelect>();
  if (personaIds.length > 0) {
    const personaRows = db.select().from(personas).where(inArray(personas.id, personaIds)).all();
    for (const p of personaRows) personaMap.set(p.id, p);
  }

  const enriched = rows.map((row) => {
    let author:
      | { name: string; avatarUrl?: string; color?: string; role?: string }
      | undefined;

    if (row.authorType === "human") {
      if (row.authorId && humanMap.has(row.authorId)) {
        const h = humanMap.get(row.authorId)!;
        author = { name: h.name, avatarUrl: h.avatarData ?? undefined };
      } else {
        // Legacy fallback for messages stored before human auth existed
        author = { name: fallbackName ?? "User", avatarUrl: fallbackAvatar };
      }
    } else if (row.authorType === "sim" && row.personaId) {
      const persona = personaMap.get(row.personaId);
      if (persona) {
        author = {
          name: persona.name,
          avatarUrl: persona.avatar ? `/api/personas/${persona.id}/avatar` : undefined,
          color: persona.color,
          role: persona.role || undefined,
        };
      }
    }

    let attachments;
    try {
      attachments = row.attachments ? JSON.parse(row.attachments) : undefined;
    } catch {
      attachments = undefined;
    }

    return {
      id: row.id,
      projectId: row.projectId,
      authorType: row.authorType,
      author,
      content: row.content,
      attachments,
      createdAt: row.createdAt,
    };
  });

  return asAsync(enriched);
}

/** Create a project message */
export function createProjectMessage(data: {
  projectId: number;
  authorType: "human" | "sim" | "system";
  authorId?: number | null;
  personaId?: string | null;
  content: string;
  attachments?: string | null;
}) {
  const row = db
    .insert(projectMessages)
    .values({
      projectId: data.projectId,
      authorType: data.authorType,
      authorId: data.authorId ?? null,
      personaId: data.personaId ?? null,
      content: data.content,
      attachments: data.attachments ?? null,
    })
    .returning()
    .get();
  return asAsync(row);
}

/** Convenience: create an agent message in project chat */
export function createAgentProjectMessage(
  projectId: number,
  personaId: string,
  content: string
) {
  return createProjectMessage({
    projectId,
    authorType: "sim",
    personaId,
    content,
  });
}

/** Get recent messages as formatted strings (for dispatch context) */
export function getRecentProjectMessagesFormatted(projectId: number, limit = 20) {
  const rows = db
    .select()
    .from(projectMessages)
    .where(eq(projectMessages.projectId, projectId))
    .orderBy(desc(projectMessages.createdAt))
    .limit(limit)
    .all()
    .reverse();

  // Batch-fetch personas for agent messages
  const personaIds = [...new Set(rows.filter((c) => c.authorType === "sim" && c.personaId).map((c) => c.personaId!))];
  const personaMap = new Map<string, typeof personas.$inferSelect>();
  if (personaIds.length > 0) {
    const personaRows = db.select().from(personas).where(inArray(personas.id, personaIds)).all();
    for (const p of personaRows) personaMap.set(p.id, p);
  }

  // Batch-fetch humans for human messages
  const humanIds = [...new Set(rows.filter((c) => c.authorType === "human" && c.authorId).map((c) => c.authorId!))];
  const humanMap = new Map<number, typeof humans.$inferSelect>();
  if (humanIds.length > 0) {
    const humanRows = db.select().from(humans).where(inArray(humans.id, humanIds)).all();
    for (const h of humanRows) humanMap.set(h.id, h);
  }

  const formatted = rows.map((c) => {
    let authorName = "Unknown";
    if (c.authorType === "sim" && c.personaId) {
      const p = personaMap.get(c.personaId);
      if (p) authorName = `${p.name} (${p.role})`;
    } else if (c.authorType === "human") {
      if (c.authorId && humanMap.has(c.authorId)) {
        authorName = humanMap.get(c.authorId)!.name;
      } else {
        authorName = "Human";
      }
    } else {
      authorName = "System";
    }
    return `**${authorName}** [${c.authorType}]:\n${c.content}`;
  });

  return asAsync(formatted);
}
