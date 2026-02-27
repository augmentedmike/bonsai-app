import { db, asAsync, runAsync } from "./_driver";
import { projects, tickets, comments, ticketAttachments, ticketAuditLog, ticketDocuments, personas, projectMessages, agentRuns, projectNotes, extractedItems } from "../schema";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import type { Project } from "@/types";
import { getSetting } from "./settings";

type StatusCounts = { planning: number; building: number; shipped: number };
type WorkerInfo = { id: string; name: string; color: string; avatar: string | null };

type TypeCounts = { bug: number; feature: number; chore: number };

function projectFromRow(
  row: typeof projects.$inferSelect,
  ticketCount?: number,
  statusCounts?: StatusCounts,
  activeWorkers?: WorkerInfo[],
  lastActivity?: string | null,
  typeCounts?: TypeCounts
): Project {
  return {
    id: String(row.id),
    name: row.name,
    slug: row.githubRepo ?? row.slug,
    description: row.description ?? undefined,
    targetCustomer: row.targetCustomer ?? undefined,
    techStack: row.techStack ?? undefined,
    visibility: row.visibility ?? undefined,
    ticketCount: ticketCount ?? 0,
    planningCount: statusCounts?.planning ?? 0,
    buildingCount: statusCounts?.building ?? 0,
    shippedCount: statusCounts?.shipped ?? 0,
    bugCount: typeCounts?.bug ?? 0,
    featureCount: typeCounts?.feature ?? 0,
    choreCount: typeCounts?.chore ?? 0,
    activeWorkers: activeWorkers?.map((w) => ({
      id: w.id,
      name: w.name,
      color: w.color,
      avatar: w.avatar ? `/api/personas/${w.id}/avatar` : undefined,
    })),
    githubOwner: row.githubOwner ?? undefined,
    githubRepo: row.githubRepo ?? undefined,
    localPath: row.localPath ?? undefined,
    buildCommand: row.buildCommand ?? undefined,
    runCommand: row.runCommand ?? undefined,
    lastActivity: lastActivity ?? row.createdAt ?? undefined,
  };
}

/** Most recent activity timestamp per project — max of last agent run start or last comment */
function getLastActivity(projectIds: number[]): Map<number, string> {
  if (projectIds.length === 0) return new Map();
  const idList = sql.join(projectIds.map((id) => sql`${id}`), sql`, `);

  // Last agent run started_at (sim activity)
  const runRows = db
    .select({ projectId: tickets.projectId, ts: sql<string>`max(${agentRuns.startedAt})` })
    .from(agentRuns)
    .innerJoin(tickets, eq(agentRuns.ticketId, tickets.id))
    .where(sql`${tickets.projectId} IN (${idList})`)
    .groupBy(tickets.projectId)
    .all();

  // Last comment created_at (human + sim activity)
  const commentRows = db
    .select({ projectId: tickets.projectId, ts: sql<string>`max(${comments.createdAt})` })
    .from(comments)
    .innerJoin(tickets, eq(comments.ticketId, tickets.id))
    .where(sql`${tickets.projectId} IN (${idList})`)
    .groupBy(tickets.projectId)
    .all();

  const map = new Map<number, string>();
  for (const r of runRows) {
    if (r.projectId != null && r.ts) map.set(r.projectId, r.ts);
  }
  for (const r of commentRows) {
    if (r.projectId == null || !r.ts) continue;
    const existing = map.get(r.projectId);
    if (!existing || r.ts > existing) map.set(r.projectId, r.ts);
  }
  return map;
}

/** Ticket totals per project */
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

/** Ticket counts broken down by type (bug/regression/feature/epic) per project */
function getTypeCounts(projectIds: number[]): Map<number, { bug: number; feature: number; chore: number }> {
  if (projectIds.length === 0) return new Map();
  const rows = db
    .select({ projectId: tickets.projectId, type: tickets.type, count: sql<number>`count(*)` })
    .from(tickets)
    .where(sql`${tickets.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)}) AND ${tickets.deletedAt} IS NULL`)
    .groupBy(tickets.projectId, tickets.type)
    .all();
  const map = new Map<number, { bug: number; feature: number; chore: number }>();
  for (const r of rows) {
    if (!map.has(r.projectId!)) map.set(r.projectId!, { bug: 0, feature: 0, chore: 0 });
    const e = map.get(r.projectId!)!;
    if (r.type === "bug") e.bug = r.count;
    else if (r.type === "feature") e.feature = r.count;
    else if (r.type === "chore") e.chore = r.count;
  }
  return map;
}

/** Ticket counts broken down by status (planning/building/shipped) per project */
function getStatusCounts(projectIds: number[]): Map<number, StatusCounts> {
  if (projectIds.length === 0) return new Map();
  const rows = db
    .select({ projectId: tickets.projectId, state: tickets.state, count: sql<number>`count(*)` })
    .from(tickets)
    .where(sql`${tickets.projectId} IN (${sql.join(projectIds.map(id => sql`${id}`), sql`, `)})`)
    .groupBy(tickets.projectId, tickets.state)
    .all();
  const map = new Map<number, StatusCounts>();
  for (const r of rows) {
    if (!map.has(r.projectId!)) map.set(r.projectId!, { planning: 0, building: 0, shipped: 0 });
    const e = map.get(r.projectId!)!;
    if (r.state === "planning") e.planning = r.count;
    else if (r.state === "building") e.building = r.count;
    else if (r.state === "shipped") e.shipped = r.count;
  }
  return map;
}

/**
 * Personas with at least one building-state ticket per project.
 * Deduped — each persona appears at most once per project.
 */
function getActiveWorkers(projectIds: number[]): Map<number, WorkerInfo[]> {
  if (projectIds.length === 0) return new Map();
  const rows = db
    .selectDistinct({
      projectId: tickets.projectId,
      personaId: personas.id,
      name: personas.name,
      color: personas.color,
      avatar: personas.avatar,
    })
    .from(tickets)
    .innerJoin(personas, eq(tickets.assigneeId, personas.id))
    .where(
      and(
        sql`${tickets.projectId} IN (${sql.join(projectIds.map((id) => sql`${id}`), sql`, `)})`,
        eq(tickets.state, "building"),
        isNull(personas.deletedAt)
      )
    )
    .all();
  const map = new Map<number, WorkerInfo[]>();
  for (const r of rows) {
    if (!map.has(r.projectId!)) map.set(r.projectId!, []);
    map.get(r.projectId!)!.push({ id: r.personaId, name: r.name, color: r.color, avatar: r.avatar });
  }
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
  const ids = rows.map((r) => r.id);
  const counts = getTicketCounts(ids);
  const statuses = getStatusCounts(ids);
  const workers = getActiveWorkers(ids);
  const activity = getLastActivity(ids);
  const types = getTypeCounts(ids);
  return asAsync(rows.map((r) => projectFromRow(r, counts.get(r.id) ?? 0, statuses.get(r.id), workers.get(r.id), activity.get(r.id), types.get(r.id))));
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
      // Hard-delete all related data for these tickets in FK-safe order:
      // comments → ticket_documents → attachments → audit_log → agent_runs → tickets
      // (comments refs ticket_documents; ticket_documents refs personas — so docs must go after comments, before personas)
      for (const tid of ticketIds) {
        db.delete(comments).where(eq(comments.ticketId, tid)).run();
        db.delete(ticketDocuments).where(eq(ticketDocuments.ticketId, tid)).run();
        db.delete(ticketAttachments).where(eq(ticketAttachments.ticketId, tid)).run();
        db.delete(ticketAuditLog).where(eq(ticketAuditLog.ticketId, tid)).run();
        db.delete(agentRuns).where(eq(agentRuns.ticketId, tid)).run();
      }
      // Hard-delete the tickets themselves
      db.delete(tickets).where(eq(tickets.projectId, id)).run();
    }

    // Reset ticket autoincrement if no tickets remain
    const remaining = db.select({ id: tickets.id }).from(tickets).limit(1).all();
    if (remaining.length === 0) {
      db.run(sql`UPDATE sqlite_sequence SET seq = 0 WHERE name = 'tickets'`);
    }

    // Hard-delete project messages
    db.delete(projectMessages).where(eq(projectMessages.projectId, id)).run();

    // Hard-delete project notes and extracted items (FK refs to project)
    db.delete(projectNotes).where(eq(projectNotes.projectId, id)).run();
    db.delete(extractedItems).where(eq(extractedItems.projectId, id)).run();

    // Hard-delete project-scoped personas
    db.delete(personas).where(eq(personas.projectId, id)).run();

    // Hard-delete the project so the slug is freed for reuse
    db.delete(projects).where(eq(projects.id, id)).run();
  });
}
