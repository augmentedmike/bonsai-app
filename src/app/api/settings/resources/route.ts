import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/db/data/settings";
import { execFileSync } from "node:child_process";
import { getTodaySpendUsd } from "@/db/data/agent-runs";

// ── Keys ──────────────────────────────────────────────
export const KEY_MAX_AGENTS  = "max_concurrent_agents";  // hard cap: dispatch + heartbeat
export const KEY_DAILY_BUDGET = "daily_budget_usd";       // $0 = no limit

// ── Defaults ─────────────────────────────────────────
export const DEFAULT_MAX_AGENTS  = 3;
export const DEFAULT_DAILY_BUDGET = 0; // uncapped until set

/** Read current concurrency limit from DB (with fallback to default) */
export async function getMaxAgents(): Promise<number> {
  const val = await getSetting(KEY_MAX_AGENTS);
  return val ? Math.max(1, Math.min(20, parseInt(val, 10))) : DEFAULT_MAX_AGENTS;
}

/** Read daily budget from DB ($0 = uncapped) */
export async function getDailyBudget(): Promise<number> {
  const val = await getSetting(KEY_DAILY_BUDGET);
  return val ? parseFloat(val) : DEFAULT_DAILY_BUDGET;
}

/** Count running claude -p agent processes */
export function countRunningAgents(): number {
  try {
    const result = execFileSync("pgrep", ["-f", "claude -p --model"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim().split("\n").filter(Boolean).length;
  } catch {
    return 0;
  }
}

// GET — return resource settings + live state
export async function GET() {
  const [maxAgents, dailyBudget, todaySpend] = await Promise.all([
    getMaxAgents(),
    getDailyBudget(),
    getTodaySpendUsd(),
  ]);

  const runningAgents = countRunningAgents();
  const budgetExceeded = dailyBudget > 0 && todaySpend >= dailyBudget;

  return NextResponse.json({
    maxAgents,
    dailyBudget,
    runningAgents,
    todaySpend,
    budgetExceeded,
    budgetRemaining: dailyBudget > 0 ? Math.max(0, dailyBudget - todaySpend) : null,
  });
}

// POST — update resource settings
export async function POST(req: Request) {
  const body = await req.json();

  if (body.maxAgents !== undefined) {
    const n = Math.max(1, Math.min(20, parseInt(body.maxAgents, 10)));
    await setSetting(KEY_MAX_AGENTS, String(n));
  }

  if (body.dailyBudget !== undefined) {
    const b = Math.max(0, parseFloat(body.dailyBudget));
    await setSetting(KEY_DAILY_BUDGET, String(b));
  }

  return NextResponse.json({ ok: true });
}
