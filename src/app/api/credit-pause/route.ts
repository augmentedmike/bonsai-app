import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting, deleteSetting, getSettingsByPrefix, deleteSettingsByPrefix } from "@/db/data/settings";
import {
  CREDITS_PAUSED_UNTIL,
  CREDITS_PAUSE_REASON,
  isPaused,
  pauseRemainingMs,
  computePauseUntil,
  projectPauseKey,
  projectPauseReasonKey,
} from "@/lib/credit-pause";
import { getProjectBySlug, getProjects } from "@/db/data/projects";
import { getTicketsByProject } from "@/db/data/tickets";
import { fireDispatch } from "@/lib/dispatch-agent";
import { db } from "@/db";
import { agentRuns, tickets } from "@/db/schema";
import { isNull, eq } from "drizzle-orm";

const API_BASE = process.env.API_BASE || "http://localhost:3080";

/** Fire dispatch for the inbox ticket of a project if there's a pending human message. */
async function dispatchPendingInbox(projectSlug: string) {
  try {
    const project = await getProjectBySlug(projectSlug);
    if (!project) return;
    const inbox = await getTicketsByProject(Number(project.id), "[Inbox]");
    if (!inbox) return;
    // Only dispatch if human commented more recently than the last agent activity
    const hasNewHumanContext =
      inbox.lastHumanCommentAt &&
      (!inbox.lastAgentActivity ||
        new Date(inbox.lastHumanCommentAt) > new Date(inbox.lastAgentActivity));
    if (!hasNewHumanContext) return;
    console.log(`[credit-pause/resume] Dispatching pending inbox for project "${projectSlug}" (ticket ${inbox.id})`);
    fireDispatch(API_BASE, inbox.id, { conversational: true }, "resume-dispatch");
  } catch (err) {
    console.error(`[credit-pause/resume] dispatchPendingInbox error for "${projectSlug}":`, err);
  }
}

/** GET — returns dispatch pause status for a project, or all paused projects */
export async function GET(req: NextRequest) {
  const projectSlug = req.nextUrl.searchParams.get("projectSlug");
  const all = req.nextUrl.searchParams.get("all");

  // Return all paused projects + focus state + active project slugs
  if (all === "true") {
    const rows = await getSettingsByPrefix(`${CREDITS_PAUSED_UNTIL}:`);
    const paused: Array<{ projectSlug: string; resumesAt: string; remainingMs: number }> = [];
    for (const row of rows) {
      if (isPaused(row.value)) {
        const slug = row.key.replace(`${CREDITS_PAUSED_UNTIL}:`, "");
        paused.push({ projectSlug: slug, resumesAt: row.value, remainingMs: pauseRemainingMs(row.value) });
      }
    }
    const focusedProject = await getSetting("focused_project");

    // Project slugs that have at least one active (not ended) agent run
    const activeRuns = db
      .selectDistinct({ projectId: tickets.projectId })
      .from(agentRuns)
      .innerJoin(tickets, eq(agentRuns.ticketId, tickets.id))
      .where(isNull(agentRuns.endedAt))
      .all();
    const activeProjectIds = new Set(activeRuns.map((r) => r.projectId));
    const allProjects = await getProjects();
    const activeProjectSlugs = allProjects
      .filter((p) => activeProjectIds.has(Number(p.id)))
      .map((p) => p.slug);

    return NextResponse.json({ paused: paused.length > 0, projects: paused, focusedProject, activeProjectSlugs });
  }

  if (!projectSlug) {
    return NextResponse.json({ error: "projectSlug query param required" }, { status: 400 });
  }

  const key = projectPauseKey(projectSlug);
  const reasonKey = projectPauseReasonKey(projectSlug);
  const resumesAt = await getSetting(key);
  const reason = await getSetting(reasonKey);
  const paused = isPaused(resumesAt);
  const remainingMs = pauseRemainingMs(resumesAt);

  // Auto-clear expired pause
  if (resumesAt && !paused) {
    await deleteSetting(key);
    await deleteSetting(reasonKey);
    return NextResponse.json({ paused: false, resumesAt: null, remainingMs: 0, reason: null });
  }

  return NextResponse.json({ paused, resumesAt, remainingMs, reason });
}

/** POST — set dispatch pause from stderr content (automatic, triggered by agent) */
export async function POST(req: NextRequest) {
  const { reason, projectSlug } = await req.json();

  if (!reason || typeof reason !== "string") {
    return NextResponse.json({ error: "reason (stderr content) required" }, { status: 400 });
  }
  if (!projectSlug || typeof projectSlug !== "string") {
    return NextResponse.json({ error: "projectSlug required" }, { status: 400 });
  }

  const key = projectPauseKey(projectSlug);
  const reasonKey = projectPauseReasonKey(projectSlug);
  const resumesAt = computePauseUntil(reason);
  await setSetting(key, resumesAt);
  await setSetting(reasonKey, reason.slice(0, 500));

  console.log(`[dispatch-pause] Project "${projectSlug}" paused until ${resumesAt} — reason: ${reason.slice(0, 100)}`);

  return NextResponse.json({
    paused: true,
    resumesAt,
    remainingMs: pauseRemainingMs(resumesAt),
  });
}

/** PUT — manually pause a project indefinitely (until explicitly resumed) */
export async function PUT(req: NextRequest) {
  const projectSlug = req.nextUrl.searchParams.get("projectSlug");
  if (!projectSlug) {
    return NextResponse.json({ error: "projectSlug query param required" }, { status: 400 });
  }

  const key = projectPauseKey(projectSlug);
  const reasonKey = projectPauseReasonKey(projectSlug);
  const resumesAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year
  await setSetting(key, resumesAt);
  await setSetting(reasonKey, "manual");

  console.log(`[dispatch-pause] Project "${projectSlug}" manually paused`);

  return NextResponse.json({ paused: true, resumesAt, remainingMs: pauseRemainingMs(resumesAt) });
}

/** DELETE — resume a project (clear pause), or resume all if ?all=true */
export async function DELETE(req: NextRequest) {
  const all = req.nextUrl.searchParams.get("all");

  if (all === "true") {
    // Collect which slugs were actually paused before clearing
    const rows = await getSettingsByPrefix(`${CREDITS_PAUSED_UNTIL}:`);
    const pausedSlugs = rows
      .filter((r) => isPaused(r.value))
      .map((r) => r.key.replace(`${CREDITS_PAUSED_UNTIL}:`, ""));

    await deleteSettingsByPrefix(`${CREDITS_PAUSED_UNTIL}:`);
    await deleteSettingsByPrefix(`${CREDITS_PAUSE_REASON}:`);
    await deleteSetting("focused_project");
    console.log("[dispatch-pause] All project pauses cleared, focus cleared");

    // Fire dispatch for any projects that had pending inbox messages
    for (const slug of pausedSlugs) {
      dispatchPendingInbox(slug);
    }

    return NextResponse.json({ paused: false });
  }

  const projectSlug = req.nextUrl.searchParams.get("projectSlug");
  if (!projectSlug) {
    return NextResponse.json({ error: "projectSlug query param required" }, { status: 400 });
  }

  const key = projectPauseKey(projectSlug);
  const reasonKey = projectPauseReasonKey(projectSlug);
  await deleteSetting(key);
  await deleteSetting(reasonKey);

  console.log(`[dispatch-pause] Project "${projectSlug}" manually resumed — pause cleared`);

  // Fire dispatch if there's a pending inbox message
  dispatchPendingInbox(projectSlug);

  return NextResponse.json({ paused: false });
}
