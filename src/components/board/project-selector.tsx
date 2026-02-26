"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { AddProjectModal } from "./add-project-modal";
import { ProjectSettingsModal } from "./project-settings-modal";

interface PauseState {
  pausedSlugs: Set<string>;
  focusedProject: string | null;
  activeSlugs: Set<string>;
}

interface ProjectSelectorProps {
  project: Project;
  allProjects: Project[];
  onSwitch?: (slug: string) => void;
}

export function ProjectSelector({ project, allProjects, onSwitch }: ProjectSelectorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Mirror the projects-dashboard sort order from localStorage
  const sortedProjects = useMemo(() => {
    let key = "activity", dir = "desc";
    try {
      key = localStorage.getItem("bonsai-projects-sort-key") || "activity";
      dir = localStorage.getItem("bonsai-projects-sort-dir") || "desc";
    } catch {}
    return [...allProjects].sort((a, b) => {
      let cmp = 0;
      if (key === "name") cmp = a.name.localeCompare(b.name);
      else if (key === "tickets") cmp = (a.ticketCount ?? 0) - (b.ticketCount ?? 0);
      else cmp = (a.lastActivity ?? "").localeCompare(b.lastActivity ?? "");
      return dir === "asc" ? cmp : -cmp;
    });
  }, [allProjects]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pauseState, setPauseState] = useState<PauseState | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch pause/focus state when dropdown opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/credit-pause?all=true")
      .then((r) => r.json())
      .then((data) => {
        setPauseState({
          pausedSlugs: new Set(
            (data.projects as { projectSlug: string }[]).map((p) => p.projectSlug)
          ),
          focusedProject: data.focusedProject || null,
          activeSlugs: new Set(data.activeProjectSlugs ?? []),
        });
      })
      .catch(() => {});
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function handleSwitch(targetSlug: string) {
    if (targetSlug === project.slug) {
      setOpen(false);
      return;
    }
    setOpen(false);
    if (onSwitch) {
      onSwitch(targetSlug);
    } else {
      router.push(`/p/${targetSlug}`);
    }
  }

  async function handlePauseToggle(e: React.MouseEvent, p: Project) {
    e.stopPropagation();
    const slug = p.slug;
    const isPaused = pauseState?.pausedSlugs.has(slug) ?? false;
    setActionLoading(`pause-${slug}`);
    try {
      if (isPaused) {
        await fetch(`/api/credit-pause?projectSlug=${slug}`, { method: "DELETE" });
        setPauseState((prev) =>
          prev
            ? { ...prev, pausedSlugs: new Set([...prev.pausedSlugs].filter((s) => s !== slug)) }
            : prev
        );
      } else {
        await fetch(`/api/credit-pause?projectSlug=${slug}`, { method: "PUT" });
        setPauseState((prev) =>
          prev
            ? { ...prev, pausedSlugs: new Set([...prev.pausedSlugs, slug]) }
            : prev
        );
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleFocusToggle(e: React.MouseEvent, p: Project) {
    e.stopPropagation();
    const slug = p.slug;
    const isFocused = pauseState?.focusedProject === slug;
    setActionLoading(`focus-${slug}`);
    try {
      if (isFocused) {
        // Unfocus — resume all
        await fetch("/api/credit-pause?all=true", { method: "DELETE" });
        setPauseState((prev) => ({ pausedSlugs: new Set(), focusedProject: null, activeSlugs: prev?.activeSlugs ?? new Set() }));
      } else {
        // Focus — pause all others
        await fetch("/api/credit-pause?all=true", { method: "DELETE" });
        const others = allProjects.filter((proj) => proj.slug !== slug);
        await Promise.all(
          others.map((proj) =>
            fetch(`/api/credit-pause?projectSlug=${proj.slug}`, { method: "PUT" })
          )
        );
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "focused_project", value: slug }),
        });
        setPauseState((prev) => ({
          pausedSlugs: new Set(others.map((proj) => proj.slug)),
          focusedProject: slug,
          activeSlugs: prev?.activeSlugs ?? new Set(),
        }));
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleHoldTickets(e: React.MouseEvent, p: Project) {
    e.stopPropagation();
    setActionLoading(`hold-${p.id}`);
    try {
      await fetch(`/api/projects/${p.id}/hold`, { method: "POST" });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <>
      <div ref={dropdownRef} style={{ position: "relative" }}>
        {/* Trigger */}
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="flex items-center gap-1.5 text-lg font-semibold transition-colors hover:opacity-70"
          style={{ color: "var(--text-primary)" }}
        >
          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>project</span>{" "}
          {project.name}
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            style={{
              transition: "transform 150ms ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {/* Dropdown panel */}
        {open && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              minWidth: 280,
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border-medium)",
              borderRadius: 12,
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              zIndex: 50,
              overflow: "hidden",
            }}
          >
            {/* Project Directory */}
            <button
              onClick={() => {
                setOpen(false);
                router.push("/projects");
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
              style={{ color: "var(--text-primary)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
              </svg>
              Project Directory
            </button>

            {/* Divider */}
            <div style={{ height: 1, backgroundColor: "var(--border-medium)" }} />

            {/* Add new project */}
            <button
              onClick={() => {
                setOpen(false);
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
              style={{ color: "var(--accent-blue)" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add new project
            </button>

            {/* Divider */}
            <div style={{ height: 1, backgroundColor: "var(--border-medium)" }} />

            {/* Project list */}
            {sortedProjects.map((p) => {
              const isActive = p.slug === project.slug;
              const isHovered = hoveredId === p.id;
              const isPaused = pauseState?.pausedSlugs.has(p.slug) ?? false;
              const isFocused = pauseState?.focusedProject === p.slug;
              const isRunning = pauseState?.activeSlugs.has(p.slug) ?? false;

              return (
                <div
                  key={p.id}
                  onMouseEnter={() => setHoveredId(p.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="flex items-center justify-between px-3 py-2.5 transition-colors"
                  style={{
                    backgroundColor: isActive
                      ? "rgba(91, 141, 249, 0.08)"
                      : isHovered
                        ? "rgba(255, 255, 255, 0.04)"
                        : "transparent",
                    cursor: "pointer",
                  }}
                >
                  {/* Project name — click to switch */}
                  <button
                    onClick={() => handleSwitch(p.slug)}
                    className="flex items-center gap-2 flex-1 text-left text-sm font-medium truncate min-w-0"
                    style={{
                      color: isActive ? "var(--accent-blue)" : "var(--text-primary)",
                    }}
                  >
                    {/* Check mark for active */}
                    <span style={{ width: 16, flexShrink: 0 }}>
                      {isActive && (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </button>

                  {/* Status indicators + action buttons — fixed width prevents CLS */}
                  <div className="flex items-center justify-end gap-1 flex-shrink-0 ml-1" style={{ width: 112 }}>
                    {/* Always-visible status badges */}
                    {isRunning && !isHovered && (
                      <span
                        title="Sims running"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: "#22c55e",
                          boxShadow: "0 0 0 0 rgba(34,197,94,0.7)",
                          animation: "pulse-green 1.5s ease-out infinite",
                        }}
                      />
                    )}
                    {isFocused && !isHovered && (
                      <span
                        title="Focused — all other projects paused"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          backgroundColor: "rgba(250, 204, 21, 0.15)",
                          color: "#facc15",
                        }}
                      >
                        {/* Target/focus icon */}
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <circle cx="12" cy="12" r="3" />
                          <circle cx="12" cy="12" r="8" />
                          <line x1="12" y1="2" x2="12" y2="6" />
                          <line x1="12" y1="18" x2="12" y2="22" />
                          <line x1="2" y1="12" x2="6" y2="12" />
                          <line x1="18" y1="12" x2="22" y2="12" />
                        </svg>
                      </span>
                    )}
                    {isPaused && !isFocused && !isHovered && (
                      <span
                        title="Dispatch paused"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          backgroundColor: "rgba(251, 146, 60, 0.15)",
                          color: "#fb923c",
                        }}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      </span>
                    )}

                    {/* Hover action buttons */}
                    {isHovered && (
                      <>
                        {/* Pause / Resume */}
                        <button
                          onClick={(e) => handlePauseToggle(e, p)}
                          disabled={actionLoading === `pause-${p.slug}`}
                          title={isPaused ? "Resume dispatch" : "Pause dispatch"}
                          className="flex items-center justify-center w-6 h-6 rounded-md transition-all hover:bg-white/10"
                          style={{
                            color: isPaused ? "#fb923c" : "var(--text-muted)",
                            backgroundColor: isPaused ? "rgba(251, 146, 60, 0.12)" : "transparent",
                          }}
                        >
                          {isPaused ? (
                            /* Play icon — resume */
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          ) : (
                            /* Pause icon */
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="6" y="4" width="4" height="16" rx="1" />
                              <rect x="14" y="4" width="4" height="16" rx="1" />
                            </svg>
                          )}
                        </button>

                        {/* Focus toggle */}
                        <button
                          onClick={(e) => handleFocusToggle(e, p)}
                          disabled={actionLoading === `focus-${p.slug}`}
                          title={isFocused ? "Unfocus — resume all projects" : "Focus — pause all other projects"}
                          className="flex items-center justify-center w-6 h-6 rounded-md transition-all hover:bg-white/10"
                          style={{
                            color: isFocused ? "#facc15" : "var(--text-muted)",
                            backgroundColor: isFocused ? "rgba(250, 204, 21, 0.12)" : "transparent",
                          }}
                        >
                          {/* Crosshair / target icon */}
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <circle cx="12" cy="12" r="3" />
                            <circle cx="12" cy="12" r="8" />
                            <line x1="12" y1="2" x2="12" y2="6" />
                            <line x1="12" y1="18" x2="12" y2="22" />
                            <line x1="2" y1="12" x2="6" y2="12" />
                            <line x1="18" y1="12" x2="22" y2="12" />
                          </svg>
                        </button>

                        {/* Hold all tickets */}
                        <button
                          onClick={(e) => handleHoldTickets(e, p)}
                          disabled={actionLoading === `hold-${p.id}`}
                          title="Put all active tickets on hold"
                          className="flex items-center justify-center w-6 h-6 rounded-md transition-all hover:bg-white/10"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {/* Hand stop / hold icon */}
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 9V5a1 1 0 0 1 2 0v4m0 0V4a1 1 0 0 1 2 0v5m0 0V6a1 1 0 0 1 2 0v5m0 0v2a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-3a1 1 0 0 1 2 0" />
                          </svg>
                        </button>

                        {/* Gear / Settings */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(false);
                            setSettingsProject(p);
                          }}
                          title="Project settings"
                          className="flex items-center justify-center w-6 h-6 rounded-md transition-all hover:bg-white/10"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add project modal */}
      <AddProjectModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
      />

      {/* Settings modal — for whichever project's gear was clicked */}
      {settingsProject && (
        <ProjectSettingsModal
          open={true}
          onClose={() => setSettingsProject(null)}
          project={settingsProject}
        />
      )}
    </>
  );
}
