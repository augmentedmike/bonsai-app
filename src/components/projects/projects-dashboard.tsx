"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { AddProjectModal } from "@/components/board/add-project-modal";
import {
  IconClose, IconChat, IconPlus, IconSearch, IconPencil,
  IconEye, IconEyeSlash, IconPlay, IconPause, IconCrosshair,
  IconHand, IconGitHub, IconSettings, IconTrash, IconSend,
} from "@/components/icons";

type SortKey = "name" | "tickets" | "activity";
type SortDir = "asc" | "desc";
type Filter = "all" | "github" | "no-github" | "active" | "empty";

interface PauseState {
  pausedSlugs: Set<string>;
  focusedProject: string | null;
  activeSlugs: Set<string>;
}

interface ChatMessage {
  id: number;
  authorType: "human" | "sim" | "system";
  author?: { name: string; avatarUrl?: string; color?: string; role?: string };
  content: string;
  createdAt: string;
}

interface ActiveAgent {
  id: string;
  name: string;
  color: string;
  avatarUrl?: string;
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

// ── Chat slide-out ─────────────────────────────────────────────────────────
interface HumanUser { id: number; name: string; }
// MentionOption type unused but kept for reference
// type MentionOption = { kind: "human"; name: string } | { kind: "sim"; name: string; role?: string; color?: string };

function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeAgents, setActiveAgents] = useState<ActiveAgent[]>([]);
  const [humanUsers, setHumanUsers] = useState<HumanUser[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastIdRef = useRef<number>(0);

  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);

  const filteredMentions: Array<{ kind: "human" | "sim"; name: string; color?: string; role?: string }> = mentionQuery !== null
    ? (() => {
        const q = mentionQuery.toLowerCase();
        const simMatches = activeAgents
          .filter((a) => a.name.toLowerCase().startsWith(q))
          .map((a) => ({ kind: "sim" as const, name: a.name, color: a.color }));
        const humanMatches = humanUsers
          .filter((h) => h.name.toLowerCase().split(" ").some((part) => part.startsWith(q)) || h.name.toLowerCase().startsWith(q))
          .map((h) => ({ kind: "human" as const, name: h.name }));
        return [...humanMatches, ...simMatches].slice(0, 8);
      })()
    : [];

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeAgents]);

  // Poll for messages while open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/global-chat?limit=100");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const msgs: ChatMessage[] = data.messages ?? [];
        setMessages(msgs);
        setActiveAgents(data.activeAgents ?? []);
        if (data.humans) setHumanUsers(data.humans);
        if (msgs.length > 0) lastIdRef.current = msgs[msgs.length - 1].id;
      } catch { /* ignore */ }
    }

    poll();
    const interval = setInterval(poll, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [open]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    try {
      await fetch("/api/global-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      // Immediately re-poll to get the saved message back
      const res = await fetch("/api/global-chat?limit=100");
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        setActiveAgents(data.activeAgents ?? []);
        if (data.humans) setHumanUsers(data.humans);
      }
    } catch { /* ignore */ }
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  if (!open) return null;

  return (
    <div
      className="flex flex-col flex-shrink-0"
      style={{
        width: 340,
        borderLeft: "1px solid var(--border-medium)",
        backgroundColor: "var(--bg-secondary)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: activeAgents.length > 0 ? "var(--accent-green)" : "var(--text-muted)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Operator Chat</span>
          {activeAgents.length > 0 && (
            <span className="text-xs" style={{ color: "var(--accent-green)" }}>{activeAgents.length} active</span>
          )}
        </div>
        <button onClick={onClose} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "var(--text-muted)" }}>
          <IconClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs text-center pt-8" style={{ color: "var(--text-muted)" }}>
            Talk to @operator about anything — projects, tickets, direction, or just thinking out loud.
          </div>
        )}
        {messages.map((m) => {
          const isHuman = m.authorType === "human";
          const name = m.author?.name ?? (isHuman ? "You" : "Sim");
          const color = m.author?.color || "var(--accent-indigo)";
          return (
            <div key={m.id} className={`flex flex-col ${isHuman ? "items-end" : "items-start"}`}>
              <span className="text-[10px] mb-0.5 px-1" style={{ color: "var(--text-muted)" }}>{name}</span>
              <div
                className="max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed"
                style={isHuman
                  ? { backgroundColor: "var(--accent-blue)", color: "#fff" }
                  : { backgroundColor: "var(--bg-card)", color: "var(--text-secondary)", border: `1px solid ${color}30`, borderLeft: `3px solid ${color}` }
                }
              >
                {m.content}
              </div>
            </div>
          );
        })}

        {/* Typing indicators */}
        {activeAgents.map((agent) => (
          <div key={agent.id} className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
              style={{ backgroundColor: agent.color }}>
              {agent.name[0]}
            </div>
            <div className="px-3 py-2 rounded-xl text-xs flex items-center gap-1"
              style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-subtle)" }}>
              <span className="animate-bounce inline-block" style={{ animationDelay: "0ms", color: agent.color }}>·</span>
              <span className="animate-bounce inline-block" style={{ animationDelay: "150ms", color: agent.color }}>·</span>
              <span className="animate-bounce inline-block" style={{ animationDelay: "300ms", color: agent.color }}>·</span>
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 flex-shrink-0" style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8 }}>
        <div className="flex items-end gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-medium)" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message @operator or @mention a sim…"
            rows={1}
            className="flex-1 bg-transparent outline-none resize-none text-xs"
            style={{ color: "var(--text-primary)", lineHeight: "1.5" }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center transition-all disabled:opacity-30"
            style={{ backgroundColor: "var(--accent-blue)" }}
          >
            <IconSend className="w-3 h-3 text-white" />
          </button>
        </div>
        <p className="text-center mt-1.5 text-xs" style={{ color: "var(--text-muted)", fontSize: 10 }}>Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────
export function ProjectsDashboard({ initialProjects }: { initialProjects: Project[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    try { return (localStorage.getItem("bonsai-projects-sort-key") as SortKey) || "activity"; } catch { return "activity"; }
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    try { return (localStorage.getItem("bonsai-projects-sort-dir") as SortDir) || "desc"; } catch { return "desc"; }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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
  const withGithub = projects.filter((p) => p.githubRepo).length;
  const totalBuilding = projects.reduce((s, p) => s + (p.buildingCount ?? 0), 0);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q) || (p.techStack ?? "").toLowerCase().includes(q)
    );
    if (filter === "github") list = list.filter((p) => p.githubRepo);
    if (filter === "no-github") list = list.filter((p) => !p.githubRepo);
    if (filter === "active") list = list.filter((p) => (p.ticketCount ?? 0) > 5);
    if (filter === "empty") list = list.filter((p) => (p.ticketCount ?? 0) === 0);
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "tickets") cmp = (a.ticketCount ?? 0) - (b.ticketCount ?? 0);
      else if (sortKey === "activity") cmp = (a.lastActivity ?? "").localeCompare(b.lastActivity ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [projects, search, filter, sortKey, sortDir]);

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
    await fetch("/api/projects", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setDeletingId(null); router.refresh();
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

  const filterChips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: projects.length },
    { key: "active", label: "Active", count: projects.filter((p) => (p.ticketCount ?? 0) > 5).length },
    { key: "github", label: "GitHub", count: withGithub },
    { key: "no-github", label: "No GitHub", count: projects.length - withGithub },
    { key: "empty", label: "Empty", count: projects.filter((p) => (p.ticketCount ?? 0) === 0).length },
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
              onClick={() => setChatOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: chatOpen ? "rgba(91,141,249,0.15)" : "var(--bg-card)",
                color: chatOpen ? "var(--accent-blue)" : "var(--text-secondary)",
                border: `1px solid ${chatOpen ? "rgba(91,141,249,0.3)" : "var(--border-medium)"}`,
              }}
            >
              <IconChat className="w-3.5 h-3.5" />
              Chat
            </button>
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
            { label: "Tickets", value: totalTickets, color: "var(--accent-green)" },
            { label: "In progress", value: totalBuilding, color: "var(--column-building)" },
            { label: "GitHub", value: `${withGithub}/${projects.length}`, color: "var(--accent-purple)" },
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
            <div className="relative">
              <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--text-muted)" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8 pr-3 py-1.5 rounded-lg text-sm outline-none w-44" style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-medium)", color: "var(--text-primary)" }} />
            </div>
            <div className="flex items-center gap-1">
              {filterChips.map((chip) => {
                const active = filter === chip.key;
                return (
                  <button key={chip.key} onClick={() => setFilter(chip.key)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all" style={{ backgroundColor: active ? "var(--accent-blue)" : "var(--bg-card)", color: active ? "#fff" : "var(--text-secondary)", border: `1px solid ${active ? "var(--accent-blue)" : "var(--border-medium)"}` }}>
                    {chip.label}
                    <span className="rounded-full px-1 tabular-nums" style={{ backgroundColor: active ? "rgba(255,255,255,0.2)" : "var(--bg-secondary)", color: active ? "#fff" : "var(--text-muted)", fontSize: 10 }}>{chip.count}</span>
                  </button>
                );
              })}
            </div>
            <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>{filtered.length} of {projects.length}</span>
          </div>

          {/* Table */}
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border-subtle)", backgroundColor: "var(--bg-card)" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  {[
                    { key: "name" as SortKey, label: "Project", w: "18%" },
                    { key: null, label: "Description", w: "18%" },
                    { key: "tickets" as SortKey, label: "Planning · Building · Shipped", w: "16%" },
                    { key: null, label: "", w: "4%" },  // visibility icon col
                    { key: null, label: "Stack", w: "8%" },
                    { key: null, label: "Team", w: "8%" },
                    { key: "activity" as SortKey, label: "Last Active", w: "12%" },
                    { key: null, label: "Actions", w: "16%" },
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
                    <td colSpan={7} className="py-14 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                      {search ? "No projects match your search." : "No projects."}
                    </td>
                  </tr>
                )}
                {filtered.map((p) => {
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
        </div>
      </div>

      {/* ── Chat slide-out (right panel, not overlay) ── */}
      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />

      <AddProjectModal open={showAdd} onClose={() => { setShowAdd(false); router.refresh(); }} />
    </div>
  );
}
