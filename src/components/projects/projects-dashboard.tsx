"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNotifications } from "@/hooks/use-notifications";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { AddProjectModal } from "@/components/board/add-project-modal";
import { ProjectChatPanel } from "@/components/board/project-chat-panel";
import { FilterDropdown } from "./filter-dropdown";
import {
  IconClose, IconChat, IconPlus, IconSearch, IconPencil,
  IconEye, IconEyeSlash, IconPlay, IconPause, IconCrosshair,
  IconHand, IconGitHub, IconSettings, IconTrash,
} from "@/components/icons";

type SortKey = "name" | "tickets" | "activity";
type SortDir = "asc" | "desc";
type FocusKey = "focused" | "paused" | "normal";

interface PauseState {
  pausedSlugs: Set<string>;
  focusedProject: string | null;
  activeSlugs: Set<string>;
}

// ── Status mini-bar ────────────────────────────────────────────────────────
function StatusBar({ planning, building, shipped }: { planning: number; building: number; shipped: number }) {
  const total = planning + building + shipped;
  if (total === 0) return <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5 h-1.5 rounded overflow-hidden" style={{ width: 60 }}>
        {planning > 0 && <div style={{ flex: planning, backgroundColor: "var(--column-planning)", borderRadius: 2 }} />}
        {building > 0 && <div style={{ flex: building, backgroundColor: "var(--column-building)", borderRadius: 2 }} />}
        {shipped > 0 && <div style={{ flex: shipped, backgroundColor: "var(--column-shipped)", borderRadius: 2 }} />}
      </div>
      <div className="flex items-center gap-1.5 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        <span title="Planning" style={{ color: "var(--column-planning)" }}>{planning}</span>
        <span style={{ opacity: 0.3 }}>·</span>
        <span title="Building" style={{ color: "var(--column-building)" }}>{building}</span>
        <span style={{ opacity: 0.3 }}>·</span>
        <span title="Shipped" style={{ color: "var(--column-shipped)" }}>{shipped}</span>
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────
export function ProjectsDashboard({ initialProjects, initialHiddenCount = 0 }: { initialProjects: Project[]; initialHiddenCount?: number }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [search, setSearch] = useState("");
  const [focusFilter, setFocusFilter] = useState<Set<FocusKey>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    try { return (localStorage.getItem("bonsai-projects-sort-key") as SortKey) || "activity"; } catch { return "activity"; }
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try { return (localStorage.getItem("bonsai-projects-sort-dir") as SortDir) || "desc"; } catch { return "desc"; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const { unread: chatUnread, markRead: markChatRead } = useNotifications();
  const [hiddenCount, setHiddenCount] = useState(initialHiddenCount);

  // Listen for sidebar avatar chat button → open Operator Chat
  useEffect(() => {
    function onOpenChat() {
      setChatOpen(true);
      markChatRead();
    }
    window.addEventListener("open-operator-chat", onOpenChat);
    return () => window.removeEventListener("open-operator-chat", onOpenChat);
  }, [markChatRead]);

  // Pause/focus/hold state
  const [pauseState, setPauseState] = useState<PauseState | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editField, setEditField] = useState<"name" | "description" | null>(null);
  const [editValue, setEditValue] = useState("");

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/credit-pause?all=true")
      .then((r) => r.json())
      .then((data) => setPauseState({
        pausedSlugs: new Set((data.projects as { projectSlug: string }[] ?? []).map((p) => p.projectSlug)),
        focusedProject: data.focusedProject || null,
        activeSlugs: new Set(data.activeProjectSlugs ?? []),
      }))
      .catch(() => {});
  }, []);

  const totalTickets = projects.reduce((s, p) => s + (p.ticketCount ?? 0), 0);
  const totalPlanning = projects.reduce((s, p) => s + (p.planningCount ?? 0), 0);
  const totalBuilding = projects.reduce((s, p) => s + (p.buildingCount ?? 0), 0);
  const totalShipped = projects.reduce((s, p) => s + (p.shippedCount ?? 0), 0);
  const totalBugs = projects.reduce((s, p) => s + (p.bugCount ?? 0), 0);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q) || (p.techStack ?? "").toLowerCase().includes(q)
    );
    // Focus filter — OR logic across selected keys; empty set = no filter
    if (focusFilter.size > 0) {
      list = list.filter((p) => {
        if (focusFilter.has("focused") && pauseState?.focusedProject === p.slug) return true;
        if (focusFilter.has("paused") && (pauseState?.pausedSlugs.has(p.slug) ?? false)) return true;
        if (focusFilter.has("normal") && !pauseState?.pausedSlugs.has(p.slug) && pauseState?.focusedProject !== p.slug) return true;
        return false;
      });
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "tickets") cmp = (a.ticketCount ?? 0) - (b.ticketCount ?? 0);
      else if (sortKey === "activity") cmp = (a.lastActivity ?? "").localeCompare(b.lastActivity ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, search, focusFilter.size, pauseState, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      const next: SortDir = sortDir === "asc" ? "desc" : "asc";
      setSortDir(next);
      try { localStorage.setItem("bonsai-projects-sort-dir", next); } catch {}
    } else {
      setSortKey(key);
      setSortDir("desc");
      try { localStorage.setItem("bonsai-projects-sort-key", key); localStorage.setItem("bonsai-projects-sort-dir", "desc"); } catch {}
    }
  }

  function startEdit(e: React.MouseEvent, id: string, field: "name" | "description", current: string) {
    e.stopPropagation();
    setEditingId(id); setEditField(field); setEditValue(current);
  }

  async function commitEdit(id: string) {
    if (!editField || !editValue.trim()) { cancelEdit(); return; }
    await fetch("/api/projects", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, [editField]: editValue.trim() }) });
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, [editField!]: editValue.trim() } : p)));
    cancelEdit(); router.refresh();
  }

  function cancelEdit() { setEditingId(null); setEditField(null); setEditValue(""); }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const res = await fetch("/api/projects", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) { setDeletingId(null); return; }
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setDeletingId(null); router.refresh();
  }

  async function handleHide(e: React.MouseEvent, p: Project) {
    e.stopPropagation();
    const res = await fetch(`/api/projects/${p.id}/hide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hidden: true }) });
    if (!res.ok) return;
    setProjects((prev) => prev.filter((proj) => proj.id !== p.id));
    setHiddenCount((c) => c + 1);
  }

  async function handlePause(e: React.MouseEvent, p: Project) {
    e.stopPropagation();
    const isPaused = pauseState?.pausedSlugs.has(p.slug) ?? false;
    setActionLoading(`pause-${p.slug}`);
    try {
      if (isPaused) {
        await fetch(`/api/credit-pause?projectSlug=${p.slug}`, { method: "DELETE" });
        setPauseState((prev) => prev ? { ...prev, pausedSlugs: new Set([...prev.pausedSlugs].filter((s) => s !== p.slug)) } : prev);
      } else {
        await fetch(`/api/credit-pause?projectSlug=${p.slug}`, { method: "PUT" });
        setPauseState((prev) => prev ? { ...prev, pausedSlugs: new Set([...prev.pausedSlugs, p.slug]) } : prev);
      }
    } finally { setActionLoading(null); }
  }

  async function handleFocus(e: React.MouseEvent, p: Project) {
    e.stopPropagation();
    const isFocused = pauseState?.focusedProject === p.slug;
    setActionLoading(`focus-${p.slug}`);
    try {
      await fetch("/api/credit-pause?all=true", { method: "DELETE" });
      if (!isFocused) {
        await Promise.all(projects.filter((proj) => proj.slug !== p.slug).map((proj) => fetch(`/api/credit-pause?projectSlug=${proj.slug}`, { method: "PUT" })));
        await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "focused_project", value: p.slug }) });
        setPauseState((prev) => ({ pausedSlugs: new Set(projects.filter((proj) => proj.slug !== p.slug).map((proj) => proj.slug)), focusedProject: p.slug, activeSlugs: prev?.activeSlugs ?? new Set() }));
      } else {
        setPauseState((prev) => ({ pausedSlugs: new Set(), focusedProject: null, activeSlugs: prev?.activeSlugs ?? new Set() }));
      }
    } finally { setActionLoading(null); }
  }

  async function handleHold(e: React.MouseEvent, p: Project) {
    e.stopPropagation();
    setActionLoading(`hold-${p.id}`);
    try { await fetch(`/api/projects/${p.id}/hold`, { method: "POST" }); }
    finally { setActionLoading(null); }
  }

  // Focus filter options (no "all" — handled inside dropdown)
  const focusOptions = [
    { key: "focused" as FocusKey, label: "Focused", count: projects.filter((p) => pauseState?.focusedProject === p.slug).length },
    { key: "paused" as FocusKey, label: "Paused", count: projects.filter((p) => pauseState?.pausedSlugs.has(p.slug) ?? false).length },
    { key: "normal" as FocusKey, label: "Normal", count: projects.filter((p) => !pauseState?.pausedSlugs.has(p.slug) && pauseState?.focusedProject !== p.slug).length },
  ];



  const SortArrow = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? <span style={{ marginLeft: 3, opacity: 0.7, fontSize: 9 }}>{sortDir === "asc" ? "▲" : "▼"}</span>
      : <span style={{ marginLeft: 3, opacity: 0.2, fontSize: 9 }}>▼</span>;

  return (
    <div className="flex h-full overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* ── Main column ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-5 pb-4 flex-shrink-0">
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Projects</h1>
          <div className="flex items-center gap-2">
            {/* Chat toggle */}
            <button
              onClick={() => { setChatOpen((o) => { if (!o) markChatRead(); return !o; }); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: chatOpen ? "rgba(91,141,249,0.15)" : "var(--bg-card)",
                color: chatOpen ? "var(--accent-blue)" : "var(--text-secondary)",
                border: `1px solid ${chatOpen ? "rgba(91,141,249,0.3)" : "var(--border-medium)"}`,
                position: "relative",
              }}
            >
              <IconChat className="w-3.5 h-3.5" />
              Chat
              {chatUnread > 0 && !chatOpen && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    backgroundColor: "#00E5FF",
                    boxShadow: "0 0 6px 2px rgba(0,229,255,0.7)",
                    animation: "notif-pulse 1.6s ease-in-out infinite",
                    border: "1.5px solid var(--bg-primary)",
                  }}
                />
              )}
            </button>
            <style>{`
              @keyframes notif-pulse {
                0%, 100% { box-shadow: 0 0 4px 1px rgba(0,229,255,0.5); }
                50% { box-shadow: 0 0 10px 4px rgba(0,229,255,0.9); }
              }
            `}</style>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
              style={{ backgroundColor: "var(--accent-blue)", color: "#fff" }}
            >
              <IconPlus className="w-3.5 h-3.5" />
              New project
            </button>
          </div>
        </div>

        {/* Stat strip */}
        <div className="flex gap-2 px-7 pb-4 flex-shrink-0">
          {[
            { label: "Projects", value: projects.length, color: "var(--accent-blue)" },
            { label: "Tickets", value: totalTickets, color: "var(--text-primary)" },
            { label: "Planning", value: totalPlanning, color: "var(--column-planning)" },
            { label: "Building", value: totalBuilding, color: "var(--column-building)" },
            { label: "Shipped", value: totalShipped, color: "var(--column-shipped)" },
            { label: "Bugs", value: totalBugs, color: "var(--accent-red)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg flex-1" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
              <span className="text-xl font-semibold tabular-nums" style={{ color }}>{value}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-7 pb-7">
          {/* Toolbar */}
          <div className="flex items-center gap-2.5 mb-3 flex-wrap">
            {/* Search */}
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--text-muted)" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none w-44" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-medium)", color: "var(--text-primary)" }} />
            </div>

            {/* Queue / focus dropdown */}
            <FilterDropdown
              label="Queue"
              options={focusOptions}
              selected={focusFilter}
              onChange={setFocusFilter}
            />


            <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>{filtered.length} of {projects.length}</span>
          </div>

          {/* Table */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)", backgroundColor: "var(--bg-card)" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {[
                    { key: null, label: "#", w: "3%" },
                    { key: "name" as SortKey, label: "Project", w: "17%" },
                    { key: null, label: "Description", w: "17%" },
                    { key: "tickets" as SortKey, label: "Planning · Building · Shipped", w: "16%" },
                    { key: null, label: "", w: "4%" },  // visibility icon col
                    { key: null, label: "Stack", w: "8%" },
                    { key: null, label: "Team", w: "8%" },
                    { key: "activity" as SortKey, label: "Last Active", w: "12%" },
                    { key: null, label: "Actions", w: "15%" },
                  ].map(({ key, label, w }) => (
                    <th key={label} onClick={key ? () => toggleSort(key) : undefined} className={key ? "cursor-pointer select-none" : ""} style={{ width: w, padding: "9px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {label}{key && <SortArrow col={key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-14 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                      {search ? "No projects match your search." : "No projects."}
                    </td>
                  </tr>
                )}
                {filtered.map((p, idx) => {
                  const isPaused = pauseState?.pausedSlugs.has(p.slug) ?? false;
                  const isFocused = pauseState?.focusedProject === p.slug;
                  const isRunning = pauseState?.activeSlugs.has(p.slug) ?? false;

                  return (
                    <tr
                      key={p.id}
                      className="group cursor-pointer transition-colors"
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-card-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
                      onClick={() => router.push(`/p/${p.slug}`)}
                    >
                      {/* # */}
                      <td style={{ padding: "10px 14px", color: "var(--text-muted)", fontSize: 11, fontVariantNumeric: "tabular-nums" }} onClick={(e) => e.stopPropagation()}>
                        {idx + 1}
                      </td>
                      {/* Name */}
                      <td style={{ padding: "10px 14px" }} onClick={(e) => e.stopPropagation()}>
                        {editingId === p.id && editField === "name" ? (
                          <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(p.id); if (e.key === "Escape") cancelEdit(); }} onBlur={() => commitEdit(p.id)} className="w-full px-2 py-1 rounded text-sm outline-none" style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--accent-blue)", color: "var(--text-primary)" }} />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {isRunning && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--accent-green)", boxShadow: "0 0 0 0 rgba(34,197,94,0.7)", animation: "pulse-green 1.5s ease-out infinite" }} />}
                            {isFocused && !isRunning && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#facc15" }} />}
                            {isPaused && !isFocused && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#fb923c" }} />}
                            <span className="font-medium text-sm truncate" style={{ color: "var(--text-primary)" }} onClick={(e) => { e.stopPropagation(); router.push(`/p/${p.slug}`); }}>
                              {p.name}
                            </span>
                            <button onClick={(e) => startEdit(e, p.id, "name", p.name)} className="opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded flex items-center justify-center hover:bg-white/10 flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                              <IconPencil className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Description */}
                      <td style={{ padding: "10px 14px" }} onClick={(e) => e.stopPropagation()}>
                        {editingId === p.id && editField === "description" ? (
                          <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitEdit(p.id); if (e.key === "Escape") cancelEdit(); }} onBlur={() => commitEdit(p.id)} className="w-full px-2 py-1 rounded text-sm outline-none" style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--accent-blue)", color: "var(--text-primary)" }} />
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="truncate text-xs block" style={{ color: p.description ? "var(--text-secondary)" : "var(--text-muted)", maxWidth: 200 }}>{p.description ?? "—"}</span>
                            <button onClick={(e) => startEdit(e, p.id, "description", p.description ?? "")} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-4 h-4 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "var(--text-muted)" }}>
                              <IconPencil className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Status breakdown */}
                      <td style={{ padding: "10px 14px" }}>
                        <StatusBar planning={p.planningCount ?? 0} building={p.buildingCount ?? 0} shipped={p.shippedCount ?? 0} />
                      </td>

                      {/* Visibility icon (no header) */}
                      <td style={{ padding: "10px 8px" }}>
                        {p.visibility === "public"
                          ? <IconEye className="w-3.5 h-3.5" style={{ color: "var(--accent-green)" }} title="Public" />
                          : <IconEyeSlash className="w-3.5 h-3.5" style={{ color: "var(--text-muted)", opacity: 0.4 }} title="Private" />
                        }
                      </td>

                      {/* Stack */}
                      <td style={{ padding: "10px 14px" }}>
                        {p.techStack ? (
                          <div className="flex flex-wrap gap-1">
                            {p.techStack.split(/[,/]/).slice(0, 2).map((t) => (
                              <span key={t.trim()} className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: "rgba(91,141,249,0.1)", color: "var(--accent-blue)", border: "1px solid rgba(91,141,249,0.18)" }}>{t.trim()}</span>
                            ))}
                          </div>
                        ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                      </td>

                      {/* Team — worker avatar bubbles for building-state tickets */}
                      <td style={{ padding: "10px 14px" }}>
                        {p.activeWorkers && p.activeWorkers.length > 0 ? (
                          <div className="flex items-center" style={{ gap: -4 }}>
                            {p.activeWorkers.slice(0, 4).map((w, i) => (
                              <div
                                key={w.id}
                                title={w.name}
                                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                                style={{
                                  backgroundColor: w.color,
                                  color: "#fff",
                                  marginLeft: i === 0 ? 0 : -6,
                                  zIndex: i,
                                  fontSize: 9,
                                  boxShadow: "0 0 0 2px var(--bg-card)",
                                }}
                              >
                                {w.avatar
                                  ? <img src={w.avatar} alt={w.name} className="w-full h-full rounded-full object-cover" />
                                  : w.name.charAt(0).toUpperCase()
                                }
                              </div>
                            ))}
                            {p.activeWorkers.length > 4 && (
                              <div
                                className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: "var(--bg-secondary)", color: "var(--text-muted)", fontSize: 9, fontWeight: 600, marginLeft: -6, boxShadow: "0 0 0 2px var(--bg-card)" }}
                              >
                                +{p.activeWorkers.length - 4}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>
                        )}
                      </td>

                      {/* Last Active */}
                      <td style={{ padding: "10px 14px" }}>
                        {p.lastActivity ? (
                          <span title={p.lastActivity} style={{ color: "var(--text-secondary)", fontSize: 11, whiteSpace: "nowrap" }}>
                            {(() => {
                              const d = new Date(p.lastActivity);
                              const now = Date.now();
                              const diff = now - d.getTime();
                              const mins = Math.floor(diff / 60000);
                              const hrs = Math.floor(diff / 3600000);
                              const days = Math.floor(diff / 86400000);
                              if (mins < 1) return "just now";
                              if (mins < 60) return `${mins}m ago`;
                              if (hrs < 24) return `${hrs}h ago`;
                              if (days < 7) return `${days}d ago`;
                              return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                            })()}
                          </span>
                        ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: "10px 14px" }} onClick={(e) => e.stopPropagation()}>
                        {deletingId === p.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={(e) => handleDelete(e, p.id)} className="px-1.5 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: "var(--accent-red)", color: "#fff" }}>Delete</button>
                            <button onClick={(e) => { e.stopPropagation(); setDeletingId(null); }} className="px-1.5 py-0.5 rounded text-xs hover:bg-white/5" style={{ color: "var(--text-muted)" }}>No</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5" style={{ flexWrap: "nowrap" }}>
                            {/* Pause/Resume */}
                            <button onClick={(e) => handlePause(e, p)} disabled={actionLoading === `pause-${p.slug}`} title={isPaused ? "Resume dispatch" : "Pause dispatch"}
                              className="w-6 h-6 flex-shrink-0 rounded flex items-center justify-center transition-all hover:bg-white/10"
                              style={{ color: isPaused ? "#fb923c" : "var(--text-muted)", backgroundColor: isPaused ? "rgba(251,146,60,0.12)" : "transparent", opacity: actionLoading === `pause-${p.slug}` ? 0.5 : 1 }}>
                              {isPaused ? <IconPlay className="w-3 h-3" /> : <IconPause className="w-3 h-3" />}
                            </button>
                            {/* Focus */}
                            <button onClick={(e) => handleFocus(e, p)} disabled={actionLoading === `focus-${p.slug}`} title={isFocused ? "Unfocus" : "Focus (pause others)"}
                              className="w-6 h-6 flex-shrink-0 rounded flex items-center justify-center transition-all hover:bg-white/10"
                              style={{ color: isFocused ? "#facc15" : "var(--text-muted)", backgroundColor: isFocused ? "rgba(250,204,21,0.12)" : "transparent" }}>
                              <IconCrosshair className="w-3.5 h-3.5" />
                            </button>
                            {/* Hold */}
                            <button onClick={(e) => handleHold(e, p)} disabled={actionLoading === `hold-${p.id}`} title="Hold all tickets"
                              className="w-6 h-6 flex-shrink-0 rounded flex items-center justify-center transition-all hover:bg-white/10"
                              style={{ color: "var(--text-muted)" }}>
                              <IconHand className="w-3.5 h-3.5" />
                            </button>
                            {/* Hide */}
                            <button onClick={(e) => handleHide(e, p)} title="Hide project"
                              className="w-6 h-6 flex-shrink-0 rounded flex items-center justify-center transition-all hover:bg-white/10"
                              style={{ color: "var(--text-muted)" }}>
                              <IconEyeSlash className="w-3.5 h-3.5" />
                            </button>
                            {/* GitHub — always reserve the slot to prevent layout shift */}
                            {p.githubOwner && p.githubRepo ? (
                              <a href={`https://github.com/${p.githubOwner}/${p.githubRepo}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="w-6 h-6 flex-shrink-0 rounded flex items-center justify-center hover:bg-white/10 transition-all" style={{ color: "var(--text-muted)" }} title="GitHub">
                                <IconGitHub className="w-3.5 h-3.5" />
                              </a>
                            ) : (
                              <span className="w-6 h-6 flex-shrink-0" />
                            )}
                            {/* Settings */}
                            <button onClick={(e) => { e.stopPropagation(); router.push(`/p/${p.slug}/settings`); }} className="w-6 h-6 flex-shrink-0 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "var(--text-muted)" }} title="Settings">
                              <IconSettings className="w-3.5 h-3.5" />
                            </button>
                            {/* Delete */}
                            <button onClick={(e) => { e.stopPropagation(); setDeletingId(p.id); }} className="w-6 h-6 flex-shrink-0 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "var(--text-muted)" }} title="Delete">
                              <IconTrash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Hidden projects footer */}
          {hiddenCount > 0 && (
            <div className="px-7 py-3 flex-shrink-0" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("open-settings", { detail: { section: "hidden-projects" } }))}
                className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                <IconEyeSlash className="w-3.5 h-3.5" />
                {hiddenCount} hidden project{hiddenCount !== 1 ? "s" : ""} — manage in Settings
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Chat slide-out (right panel, not overlay) ── */}
      <ProjectChatPanel
        projectId="global"
        chatPath="/api/global-chat"
        title="Operator Chat"
        personas={[]}
        humanMembers={[
          { name: "Mike", color: "#3b82f6" },
          { name: "Ryan", color: "#10b981" },
        ]}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />

      <AddProjectModal open={showAdd} onClose={() => { setShowAdd(false); router.refresh(); }} />
    </div>
  );
}
