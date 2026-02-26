import { db, asAsync, runAsync } from "./_driver";
import { agentRuns } from "../schema";
import { eq, and, desc, ne, sql } from "drizzle-orm";

const STALE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export function insertAgentRun(params: {
  ticketId: number;
  personaId: string;
  phase: string;
  tools?: string[];
  sessionDir?: string;
  dispatchSource?: string;
}): Promise<number> {
  // Abandon any existing running runs for same ticket+persona only (orphan cleanup).
  // Do NOT abandon runs for other tickets — the 30-min stale timeout handles true orphans.
  db.update(agentRuns)
    .set({
      status: "abandoned",
      completedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(agentRuns.ticketId, params.ticketId),
        eq(agentRuns.personaId, params.personaId),
        eq(agentRuns.status, "running")
      )
    )
    .run();

  const result = db
    .insert(agentRuns)
    .values({
      ticketId: params.ticketId,
      personaId: params.personaId,
      phase: params.phase,
      status: "running",
      tools: params.tools ? JSON.stringify(params.tools) : null,
      sessionDir: params.sessionDir || null,
      dispatchSource: params.dispatchSource || null,
      startedAt: new Date().toISOString(),
    })
    .run();

  return Promise.resolve(Number(result.lastInsertRowid));
}

/** Check if the most recent running run for a ticket+persona was a chained dispatch */
export function isChainedRun(ticketId: number, personaId: string): boolean {
  const run = db
    .select({ dispatchSource: agentRuns.dispatchSource })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.ticketId, ticketId),
        eq(agentRuns.personaId, personaId),
        eq(agentRuns.status, "running")
      )
    )
    .orderBy(desc(agentRuns.startedAt))
    .limit(1)
    .get();
  return run?.dispatchSource === "agent-chain";
}

export function completeAgentRun(
  ticketId: number,
  personaId: string,
  status: "completed" | "failed" | "timeout",
  errorMessage?: string,
  costData?: { costUsd?: number | null; inputTokens?: number | null; outputTokens?: number | null; cacheReadTokens?: number | null; sessionId?: string | null; modelUsage?: string | null }
): Promise<void> {
  // Stateless lookup: find the most recent running run for this ticket+persona
  const run = db
    .select({ id: agentRuns.id, startedAt: agentRuns.startedAt })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.ticketId, ticketId),
        eq(agentRuns.personaId, personaId),
        eq(agentRuns.status, "running")
      )
    )
    .orderBy(desc(agentRuns.startedAt))
    .limit(1)
    .all();

  if (run.length === 0) return Promise.resolve();

  const r = run[0];
  const durationMs = r.startedAt
    ? Date.now() - new Date(r.startedAt).getTime()
    : null;

  const now = new Date().toISOString();
  db.run(sql`
    UPDATE agent_runs SET
      status = ${status},
      completed_at = ${now},
      duration_ms = ${durationMs},
      error_message = ${errorMessage || null},
      cost_usd = ${costData?.costUsd ?? null},
      input_tokens = ${costData?.inputTokens ?? null},
      output_tokens = ${costData?.outputTokens ?? null},
      cache_read_tokens = ${costData?.cacheReadTokens ?? null},
      session_id = ${costData?.sessionId ?? null},
      model_usage = ${costData?.modelUsage ?? null}
    WHERE id = ${r.id}
  `);

  return Promise.resolve();
}

export function touchAgentRunReport(
  ticketId: number,
  personaId: string,
  message?: string
): Promise<void> {
  const now = new Date().toISOString();
  if (message) {
    db.run(sql`
      UPDATE agent_runs SET last_report_at = ${now}, last_report_message = ${message.slice(0, 500)}
      WHERE id = (
        SELECT id FROM agent_runs
        WHERE ticket_id = ${ticketId} AND persona_id = ${personaId} AND status = 'running'
        ORDER BY started_at DESC LIMIT 1
      )
    `);
  } else {
    db.run(sql`
      UPDATE agent_runs SET last_report_at = ${now}
      WHERE id = (
        SELECT id FROM agent_runs
        WHERE ticket_id = ${ticketId} AND persona_id = ${personaId} AND status = 'running'
        ORDER BY started_at DESC LIMIT 1
      )
    `);
  }
  return Promise.resolve();
}

interface AgentRunWithContext {
  id: number;
  ticketId: number;
  ticketTitle: string | null;
  projectId: number | null;
  projectSlug: string | null;
  projectName: string | null;
  personaId: string;
  personaName: string | null;
  personaColor: string | null;
  personaRole: string | null;
  phase: string;
  status: string;
  tools: string | null;
  dispatchSource: string | null;
  startedAt: string | null;
  lastReportAt: string | null;
  lastReportMessage: string | null;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  sessionId: string | null;
  modelUsage: string | null;
}

export function getAgentRuns(limit: number = 50, projectId?: number): Promise<AgentRunWithContext[]> {
  // First, mark stale runs (>30 min) as timeout
  const cutoff = new Date(Date.now() - STALE_TIMEOUT_MS).toISOString();
  db.update(agentRuns)
    .set({
      status: "timeout",
      completedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(agentRuns.status, "running"),
        sql`${agentRuns.startedAt} < ${cutoff}`
      )
    )
    .run();

  const projectFilter = projectId ? sql`AND t.project_id = ${projectId}` : sql``;

  // Return runs joined with persona + ticket + project info
  const rows = db.all(sql`
    SELECT
      ar.id,
      ar.ticket_id as ticketId,
      t.title as ticketTitle,
      t.project_id as projectId,
      proj.slug as projectSlug,
      proj.name as projectName,
      ar.persona_id as personaId,
      p.name as personaName,
      p.color as personaColor,
      p.role as personaRole,
      ar.phase,
      ar.status,
      ar.tools,
      ar.dispatch_source as dispatchSource,
      ar.started_at as startedAt,
      ar.last_report_at as lastReportAt,
      ar.last_report_message as lastReportMessage,
      ar.completed_at as completedAt,
      ar.duration_ms as durationMs,
      ar.error_message as errorMessage,
      ar.cost_usd as costUsd,
      ar.input_tokens as inputTokens,
      ar.output_tokens as outputTokens,
      ar.cache_read_tokens as cacheReadTokens,
      ar.session_id as sessionId,
      ar.model_usage as modelUsage
    FROM agent_runs ar
    LEFT JOIN personas p ON p.id = ar.persona_id
    LEFT JOIN tickets t ON t.id = ar.ticket_id
    LEFT JOIN projects proj ON proj.id = t.project_id
    WHERE 1=1 ${projectFilter}
    ORDER BY ar.started_at DESC
    LIMIT ${limit}
  `) as AgentRunWithContext[];

  return asAsync(rows);
}

/** Sum of cost_usd for all completed runs today (UTC day) */
export function getTodaySpendUsd(): Promise<number> {
  const row = db.get(sql`
    SELECT COALESCE(SUM(cost_usd), 0) as total
    FROM agent_runs
    WHERE cost_usd IS NOT NULL
      AND started_at >= date('now')
  `) as { total: number };
  return Promise.resolve(row?.total ?? 0);
}

export function clearFinishedAgentRuns(projectId?: number): Promise<void> {
  return runAsync(() => {
    if (projectId) {
      db.run(sql`
        DELETE FROM agent_runs
        WHERE status != 'running'
          AND ticket_id IN (SELECT id FROM tickets WHERE project_id = ${projectId})
      `);
    } else {
      db.delete(agentRuns).where(ne(agentRuns.status, "running")).run();
    }
  });
}
