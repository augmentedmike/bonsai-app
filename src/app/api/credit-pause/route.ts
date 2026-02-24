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

/** GET — returns dispatch pause status for a project, or all paused projects */
export async function GET(req: NextRequest) {
  const projectSlug = req.nextUrl.searchParams.get("projectSlug");
  const all = req.nextUrl.searchParams.get("all");

  // Return all paused projects
  if (all === "true") {
    const rows = await getSettingsByPrefix(`${CREDITS_PAUSED_UNTIL}:`);
    const paused: Array<{ projectSlug: string; resumesAt: string; remainingMs: number }> = [];
    for (const row of rows) {
      if (isPaused(row.value)) {
        const slug = row.key.replace(`${CREDITS_PAUSED_UNTIL}:`, "");
        paused.push({ projectSlug: slug, resumesAt: row.value, remainingMs: pauseRemainingMs(row.value) });
      }
    }
    return NextResponse.json({ paused: paused.length > 0, projects: paused });
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
    await deleteSettingsByPrefix(`${CREDITS_PAUSED_UNTIL}:`);
    await deleteSettingsByPrefix(`${CREDITS_PAUSE_REASON}:`);
    console.log("[dispatch-pause] All project pauses cleared");
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

  return NextResponse.json({ paused: false });
}
