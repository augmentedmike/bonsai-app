"use client";

import { useState, useEffect } from "react";
import type { AgentRun } from "@/types";

// --- Helpers ---

function formatElapsed(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remSecs}s`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const ms = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function formatCost(usd: number | null): string {
  if (usd == null) return "—";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// --- Badges & Avatars ---

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    running:   { bg: "rgba(34, 197, 94, 0.15)",   text: "#22c55e" },
    completed: { bg: "rgba(34, 197, 94, 0.15)",   text: "#22c55e" },
    failed:    { bg: "rgba(239, 68, 68, 0.15)",   text: "#ef4444" },
    timeout:   { bg: "rgba(234, 179, 8, 0.15)",   text: "#eab308" },
    abandoned: { bg: "rgba(107, 114, 128, 0.15)", text: "#6b7280" },
  };
  const c = colors[status] || colors.abandoned;
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium capitalize"
      style={{ backgroundColor: c.bg, color: c.text }}>
      {status}
    </span>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span className="px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: "rgba(99, 102, 241, 0.15)", color: "#818cf8" }}>
      {phase}
    </span>
  );
}

function PersonaAvatar({ name, color, size = 36 }: { name: string | null; color: string | null; size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: color || "#6366f1", fontSize: size * 0.38 }}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

// --- Credit Pause Banner ---

interface CreditPauseStatus {
  paused: boolean;
  resumesAt: string | null;
  remainingMs: number;
  reason: string | null;
}

function CreditPauseBanner({ status, onResume }: { status: CreditPauseStatus; onResume: () => void }) {
  const [remaining, setRemaining] = useState(status.remainingMs);
  useEffect(() => {
    setRemaining(status.remainingMs);
    const interval = setInterval(() => setRemaining(p => Math.max(0, p - 1000)), 1000);
    return () => clearInterval(interval);
  }, [status.remainingMs]);

  const mins = Math.floor(remaining / 60_000);
  const secs = Math.floor((remaining % 60_000) / 1000);
  const timeStr = status.resumesAt
    ? new Date(status.resumesAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="rounded-lg px-4 py-3 mb-6"
      style={{ backgroundColor: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.25)" }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: "#f59e0b" }}>
          Dispatch Paused
          {timeStr && <span className="font-normal ml-2" style={{ color: "var(--text-secondary)" }}>
            Resumes at {timeStr} <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>({mins}m {secs}s)</span>
          </span>}
        </span>
        <button onClick={onResume}
          className="text-xs font-medium py-1.5 px-3 rounded"
          style={{ backgroundColor: "rgba(245, 158, 11, 0.15)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.3)" }}>
          Resume Now
        </button>
      </div>
    </div>
  );
}

// --- Heartbeat Bar ---

interface HeartbeatStatus {
  status: "running" | "idle" | "unknown";
  lastPing: string | null;
  lastCompleted: string | null;
  lastResult: { dispatched: number; completed: number; skipped: number } | null;
  authExpired?: boolean;
}

function HeartbeatBar({ hb, onReauthDone }: { hb: HeartbeatStatus | null; onReauthDone: () => void }) {
  const [, setTick] = useState(0);
  const [reauthState, setReauthState] = useState<"idle" | "triggered">("idle");

  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, []);

  if (hb?.authExpired) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
        style={{ backgroundColor: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
        <span style={{ color: "#f87171" }}>⚠ Auth expired — re-authenticating…</span>
        {reauthState === "idle" && (
          <button onClick={async () => { setReauthState("triggered"); await fetch("/api/auth/reauth", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {}); }}
            className="px-2 py-0.5 rounded text-xs font-semibold"
            style={{ backgroundColor: "rgba(239, 68, 68, 0.25)", color: "#f87171" }}>
            Retry
          </button>
        )}
        {reauthState === "triggered" && <span style={{ color: "rgba(255,255,255,0.4)" }}>Chrome opening…</span>}
        <button onClick={async () => { await fetch("/api/auth/reauth", { method: "DELETE" }); onReauthDone(); }}
          className="px-2 py-0.5 rounded text-xs"
          style={{ color: "rgba(255,255,255,0.3)" }} title="Clear if already logged in">
          Resume
        </button>
      </div>
    );
  }

  if (!hb?.lastPing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
        style={{ backgroundColor: "rgba(255,255,255,0.03)", color: "var(--text-muted)" }}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.2)" }} />
        Heartbeat — no data
      </div>
    );
  }

  const sinceCompleteMs = hb.lastCompleted ? Date.now() - new Date(hb.lastCompleted).getTime() : null;
  const sinceMs = hb.lastPing ? Date.now() - new Date(hb.lastPing).getTime() : null;
  const isRunning = hb.status === "running";
  const isStale = sinceMs !== null && sinceMs > 90_000;
  const color = isRunning ? "#818cf8" : isStale ? "#f59e0b" : "#22c55e";
  const label = isRunning ? "Scanning…" : sinceCompleteMs !== null ? `Last scan ${formatElapsed(hb.lastCompleted!)} ago` : "Idle";
  const resultStr = hb.lastResult
    ? `${hb.lastResult.dispatched} dispatched · ${hb.lastResult.skipped} skipped`
    : null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
      style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color, animation: isRunning ? "pulse 1s cubic-bezier(0.4,0,0.6,1) infinite" : undefined }} />
      <span style={{ color }}>{label}</span>
      {resultStr && !isRunning && <span style={{ color: "var(--text-muted)" }}>— {resultStr}</span>}
    </div>
  );
}

// --- Active Agent Card ---

function ActiveAgentCard({ run, projectSlug }: { run: AgentRun; projectSlug?: string }) {
  const [elapsed, setElapsed] = useState(run.startedAt ? formatElapsed(run.startedAt) : "0s");
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!run.startedAt) return;
    const interval = setInterval(() => {
      setElapsed(formatElapsed(run.startedAt!));
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [run.startedAt]);

  const slug = run.projectSlug || projectSlug;
  const ticketHref = slug ? `/p/${slug}/board` : undefined;

  return (
    <div className="rounded-lg p-4"
      style={{
        backgroundColor: "var(--bg-card, var(--bg-secondary))",
        border: "1px solid var(--border-subtle)",
        borderLeft: "3px solid #22c55e",
      }}>
      {/* Top row: avatar + name + tags */}
      <div className="flex items-start gap-3">
        <div className="relative flex-shrink-0 mt-0.5">
          <PersonaAvatar name={run.personaName} color={run.personaColor} size={38} />
          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
            style={{ backgroundColor: "#22c55e", borderColor: "var(--bg-card, var(--bg-secondary))", animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {run.personaName || "Sim"}
            </span>
            {run.personaRole && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: "rgba(107,114,128,0.15)", color: "#9ca3af" }}>
                {run.personaRole}
              </span>
            )}
            <PhaseBadge phase={run.phase} />
            {(run.projectName || run.projectSlug) && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ backgroundColor: "rgba(129,140,248,0.1)", color: "#a5b4fc" }}>
                {run.projectName || run.projectSlug}
              </span>
            )}
          </div>

          {/* Ticket title */}
          <div className="mt-1">
            {ticketHref ? (
              <a href={ticketHref}
                className="text-sm hover:underline"
                style={{ color: "var(--text-secondary)" }}>
                #{run.ticketId} {run.ticketTitle || "Untitled"}
              </a>
            ) : (
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                #{run.ticketId} {run.ticketTitle || "Untitled"}
              </span>
            )}
          </div>

          {/* Last report message */}
          {run.lastReportMessage && (
            <div className="mt-2 px-3 py-2 rounded text-xs italic"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", borderLeft: "2px solid rgba(129,140,248,0.4)" }}>
              "{run.lastReportMessage}"
            </div>
          )}
          {!run.lastReportMessage && (
            <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
              No status updates yet…
            </div>
          )}

          {/* Footer: elapsed + last update + source */}
          <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono font-semibold" style={{ color: "#22c55e" }}>{elapsed}</span>
            {run.lastReportAt && (
              <span>Updated {formatTimeAgo(run.lastReportAt)}</span>
            )}
            {run.dispatchSource && (
              <span style={{ color: "rgba(255,255,255,0.2)" }}>via {run.dispatchSource}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- History Row ---

type FilterTab = "all" | "completed" | "failed" | "timeout" | "abandoned";

function HistoryRow({ run, projectSlug }: { run: AgentRun; projectSlug?: string }) {
  const slug = run.projectSlug || projectSlug;
  const ticketHref = slug ? `/p/${slug}/board` : undefined;

  return (
    <div className="grid gap-3 px-4 py-2.5 items-center text-sm transition-colors hover:bg-white/[0.02]"
      style={{ gridTemplateColumns: "2fr 3fr 1fr 1fr 1fr 1fr 1fr", borderBottom: "1px solid var(--border-subtle)" }}>
      {/* Agent */}
      <div className="flex items-center gap-2 min-w-0">
        <PersonaAvatar name={run.personaName} color={run.personaColor} size={24} />
        <span className="truncate text-xs" style={{ color: "var(--text-secondary)" }}>
          {run.personaName || "Sim"}
        </span>
      </div>
      {/* Ticket */}
      <div className="min-w-0">
        {ticketHref ? (
          <a href={ticketHref} className="text-xs truncate block hover:underline"
            style={{ color: "var(--text-secondary)" }} title={run.ticketTitle || undefined}>
            #{run.ticketId} {run.ticketTitle}
          </a>
        ) : (
          <span className="text-xs truncate block" style={{ color: "var(--text-secondary)" }}>
            #{run.ticketId} {run.ticketTitle}
          </span>
        )}
        {(run.projectName || run.projectSlug) && (
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {run.projectName || run.projectSlug}
          </span>
        )}
      </div>
      {/* Phase */}
      <div><PhaseBadge phase={run.phase} /></div>
      {/* Status */}
      <div><StatusBadge status={run.status} /></div>
      {/* Duration */}
      <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
        {run.durationMs != null ? formatDuration(run.durationMs) : "—"}
      </span>
      {/* Cost */}
      <div>
        {run.costUsd != null ? (
          <span className="text-xs font-mono" style={{ color: run.costUsd > 1 ? "#f87171" : run.costUsd > 0.25 ? "#fbbf24" : "#4ade80" }}>
            {formatCost(run.costUsd)}
          </span>
        ) : (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
        )}
      </div>
      {/* When */}
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {formatDateTime(run.startedAt)}
      </span>
    </div>
  );
}

// --- Main Component ---

export function AgentActivityView({ projectSlug }: { projectSlug?: string }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [creditPause, setCreditPause] = useState<CreditPauseStatus | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [heartbeat, setHeartbeat] = useState<HeartbeatStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const runsUrl = projectSlug
          ? `/api/agent-runs?limit=100&projectSlug=${projectSlug}`
          : `/api/agent-runs?limit=200`;
        const pausePromise = projectSlug
          ? fetch(`/api/credit-pause?projectSlug=${projectSlug}`).then(r => r.json())
          : Promise.resolve(null);
        const [runsRes, pauseData, hbRes] = await Promise.all([
          fetch(runsUrl),
          pausePromise,
          fetch("/api/heartbeat-status"),
        ]);
        if (cancelled) return;
        const runsData = await runsRes.json();
        const hbData = await hbRes.json();
        setRuns(Array.isArray(runsData) ? runsData : []);
        setCreditPause(pauseData);
        setHeartbeat(hbData);
      } catch {}
    }
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [projectSlug]);

  async function handleResume() {
    if (!projectSlug) return;
    try {
      await fetch(`/api/credit-pause?projectSlug=${projectSlug}`, { method: "DELETE" });
      setCreditPause({ paused: false, resumesAt: null, remainingMs: 0, reason: null });
    } catch {}
  }

  const activeRuns = runs.filter(r => r.status === "running");
  const finishedRuns = runs.filter(r => r.status !== "running");

  // Today's stats
  const todayRuns = runs.filter(r => isToday(r.startedAt));
  const todayCost = todayRuns.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const todayCompleted = todayRuns.filter(r => r.status === "completed").length;
  const todayInputTokens = todayRuns.reduce((sum, r) => sum + (r.inputTokens ?? 0), 0);
  const todayOutputTokens = todayRuns.reduce((sum, r) => sum + (r.outputTokens ?? 0), 0);
  const todayCacheTokens = todayRuns.reduce((sum, r) => sum + (r.cacheReadTokens ?? 0), 0);

  const filteredRuns = filter === "all" ? finishedRuns : finishedRuns.filter(r => r.status === filter);
  const filterCounts: Record<FilterTab, number> = {
    all: finishedRuns.length,
    completed: finishedRuns.filter(r => r.status === "completed").length,
    failed: finishedRuns.filter(r => r.status === "failed").length,
    timeout: finishedRuns.filter(r => r.status === "timeout").length,
    abandoned: finishedRuns.filter(r => r.status === "abandoned").length,
  };

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Header */}
      <div className="flex-shrink-0 border-b px-8 py-5" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Sim Activity</h1>
            {activeRuns.length > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#22c55e", animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" }} />
                <span className="text-xs font-medium" style={{ color: "#22c55e" }}>{activeRuns.length} running</span>
              </div>
            )}
          </div>
          <HeartbeatBar hb={heartbeat} onReauthDone={() => setHeartbeat(hb => hb ? { ...hb, authExpired: false } : hb)} />
        </div>

        {/* Stats row — today's totals */}
        <div className="flex items-center gap-6 text-sm" style={{ color: "var(--text-muted)" }}>
          <div>
            <span className="font-semibold text-base" style={{ color: todayCost > 5 ? "#f87171" : todayCost > 1 ? "#fbbf24" : "var(--text-primary)" }}>
              {todayCost > 0 ? formatCost(todayCost) : "—"}
            </span>
            <span className="ml-1 text-xs">today</span>
          </div>
          <div className="w-px h-4" style={{ backgroundColor: "var(--border-subtle)" }} />
          <div>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{todayCompleted}</span>
            <span className="ml-1 text-xs">completed</span>
          </div>
          {todayInputTokens > 0 && (
            <>
              <div className="w-px h-4" style={{ backgroundColor: "var(--border-subtle)" }} />
              <div className="text-xs flex gap-3">
                <span><span style={{ color: "var(--text-secondary)" }}>{formatTokens(todayInputTokens)}</span> in</span>
                <span><span style={{ color: "var(--text-secondary)" }}>{formatTokens(todayOutputTokens)}</span> out</span>
                <span><span style={{ color: "var(--text-secondary)" }}>{formatTokens(todayCacheTokens)}</span> cache reads</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {creditPause?.paused && (
          <CreditPauseBanner status={creditPause} onResume={handleResume} />
        )}

        {/* Active Agents */}
        <div className="mb-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2"
            style={{ color: "var(--text-muted)" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeRuns.length > 0 ? "#22c55e" : "var(--text-muted)" }} />
            Running ({activeRuns.length})
          </h2>

          {activeRuns.length === 0 ? (
            <div className="rounded-lg px-6 py-8 text-center"
              style={{ backgroundColor: "var(--bg-card, var(--bg-secondary))", border: "1px solid var(--border-subtle)" }}>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>No sims running</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {activeRuns.map(run => (
                <ActiveAgentCard key={run.id} run={run} projectSlug={projectSlug} />
              ))}
            </div>
          )}
        </div>

        {/* Run History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider mr-2" style={{ color: "var(--text-muted)" }}>
                History
              </h2>
              {(["all", "completed", "failed", "timeout", "abandoned"] as FilterTab[]).map(tab => (
                <button key={tab}
                  onClick={() => setFilter(tab)}
                  className="px-2.5 py-1 rounded text-xs font-medium transition-colors"
                  style={filter === tab
                    ? { backgroundColor: "rgba(255,255,255,0.1)", color: "var(--text-primary)" }
                    : { color: "var(--text-muted)" }}>
                  {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1)} ({filterCounts[tab]})
                </button>
              ))}
            </div>
            {finishedRuns.length > 0 && (
              <button
                onClick={async () => {
                  await fetch(projectSlug ? `/api/agent-runs?projectSlug=${projectSlug}` : `/api/agent-runs`, { method: "DELETE" });
                  setRuns(prev => prev.filter(r => r.status === "running"));
                }}
                className="text-xs transition-colors hover:opacity-80"
                style={{ color: "var(--text-muted)" }}>
                Clear
              </button>
            )}
          </div>

          {filteredRuns.length === 0 ? (
            <div className="rounded-lg px-6 py-8 text-center"
              style={{ backgroundColor: "var(--bg-card, var(--bg-secondary))", border: "1px solid var(--border-subtle)" }}>
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>No runs</span>
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-subtle)" }}>
              {/* Header */}
              <div className="grid gap-3 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider"
                style={{ gridTemplateColumns: "2fr 3fr 1fr 1fr 1fr 1fr 1fr", backgroundColor: "var(--bg-card, var(--bg-secondary))", color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>
                <span>Sim</span>
                <span>Ticket</span>
                <span>Phase</span>
                <span>Status</span>
                <span>Duration</span>
                <span>Cost</span>
                <span>When</span>
              </div>
              {filteredRuns.map(run => (
                <HistoryRow key={run.id} run={run} projectSlug={projectSlug} />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
