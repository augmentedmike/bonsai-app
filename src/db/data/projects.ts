import { db, asAsync, runAsync } from "./_driver";
import { projects, tickets, comments, ticketDocuments, ticketAttachments, ticketAuditLog, personas, projectMessages } from "../schema";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import type { Project } from "@/types";
import { getSetting } from "./settings";

function projectFromRow(row: typeof projects.$inferSelect, ticketCount?: number): Project {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.githubRepo ?? row.slug,
    description: row.description ?? undefined,
    targetCustomer: row.targetCustomer ?? undefined,
    techStack: row.techStack ?? undefined,
    visibility: row.visibility ?? undefined,
    ticketCount: ticketCount ?? 0,
    githubOwner: row.githubOwner ?? undefined,
    githubRepo: row.githubRepo ?? undefined,
    localPath: row.localPath ?? undefined,
    buildCommand: row.buildCommand ?? undefined,
    runCommand: row.runCommand ?? undefined,
  };
}

/** Single query to get ticket counts for one or more projects */
function getTicketCounts(projectIds: number[]): Map<number, number> {
  if (projectIds.length === 0) return new Map();
  const rows = db
    .select({ projectId: tickets.projectId, count: sql<number>`count(*)` })
    .from(tickets)
    .where(sql`${tickets.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`)
    .groupBy(tickets.projectId)
    .all();
  const map = new Map<number, number>();
  for (const r of rows) map.set(r.projectId!, r.count);
  return map;
}

export async function getProject(): Promise<Project | null> {
  const notDeleted = isNull(projects.deletedAt);
  const activeId = await getSetting("active_project_id");
  const row = activeId
    ? db
        .select()
        .from(projects)
        .where(and(eq(projects.id, Number(activeId)), notDeleted))
        .get() ??
      db.select().from(projects).where(notDeleted).limit(1).get()
    : db.select().from(projects).where(notDeleted).limit(1).get();
  if (!row) return null;
  const counts = getTicketCounts([row.id]);
  return projectFromRow(row, counts.get(row.id) ?? 0);
}

export function getProjectById(id: number) {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  return asAsync(row ?? null);
}

export function getProjectBySlug(slug: string): Promise<Project | null> {
  const row = db
    .select()
    .from(projects)
    .where(
      and(
        or(eq(projects.githubRepo, slug), eq(projects.slug, slug)),
        isNull(projects.deletedAt)
      )
    )
    .get();
  if (!row) return asAsync(null);
  const counts = getTicketCounts([row.id]);
  return asAsync(projectFromRow(row, counts.get(row.id) ?? 0));
}

export function getProjects(): Promise<Project[]> {
  const rows = db
    .select()
    .from(projects)
    .where(isNull(projects.deletedAt))
    .all();
  const counts = getTicketCounts(rows.map((r) => r.id));
  return asAsync(rows.map((r) => projectFromRow(r, counts.get(r.id) ?? 0)));
}

export function createProject(data: {
  name: string;
  slug: string;
  visibility: "public" | "private";
  description?: string;
  githubOwner?: string;
  githubRepo?: string;
  localPath?: string;
}) {
  const row = db
    .insert(projects)
    .values(data)
    .returning()
    .get();
  return asAsync(row);
}

export function updateProject(
  id: number,
  data: Record<string, string | null>
): Promise<void> {
  return runAsync(() => {
    db.update(projects).set(data).where(eq(projects.id, id)).run();
  });
}

export function softDeleteProject(id: number): Promise<void> {
  return runAsync(() => {
    // Get all ticket IDs for this project
    const ticketRows = db.select({ id: tickets.id })
      .from(tickets)
      .where(eq(tickets.projectId, id))
      .all();
    const ticketIds = ticketRows.map((r) => r.id);

    if (ticketIds.length > 0) {
      // Hard-delete all related data for these tickets
      for (const tid of ticketIds) {
        db.delete(comments).where(eq(comments.ticketId, tid)).run();
        db.delete(ticketDocuments).where(eq(ticketDocuments.ticketId, tid)).run();
        db.delete(ticketAttachments).where(eq(ticketAttachments.ticketId, tid)).run();
        db.delete(ticketAuditLog).where(eq(ticketAuditLog.ticketId, tid)).run();
      }
      // Hard-delete the tickets themselves
      db.delete(tickets).where(eq(tickets.projectId, id)).run();
    }

    // Reset ticket autoincrement if no tickets remain
    const remaining = db.select({ id: tickets.id }).from(tickets).limit(1).all();
    if (remaining.length === 0) {
      db.run(sql`UPDATE sqlite_sequence SET seq = 0 WHERE name = 'tickets'`);
    }

    // Hard-delete personas for this project
    db.delete(personas).where(eq(personas.projectId, id)).run();

    // Hard-delete project messages
    db.delete(projectMessages).where(eq(projectMessages.projectId, id)).run();

    // Hard-delete the project so the slug is freed for reuse
    db.delete(projects).where(eq(projects.id, id)).run();
  });
}
