"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";
import { ProjectSettingsModal } from "./project-settings-modal";
import { useLanguage } from "@/i18n/language-context";

interface BoardActionsProps {
  project: Project;
  shippedCount: number;
  hasCommands: boolean;
  previewMode: boolean;
  onPreviewToggle: () => void;
  onPreviewStart: () => void;
  onPreviewReady: (url: string) => void;
  onPreviewError: (error: string) => void;
}

export function BoardActions({ project, shippedCount, hasCommands, previewMode, onPreviewToggle, onPreviewStart, onPreviewReady, onPreviewError }: BoardActionsProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const [previewing, setPreviewing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [paused, setPaused] = useState(false);
  const [anyPaused, setAnyPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);

  // Poll pause state every 10s
  useEffect(() => {
    async function fetchPauseState() {
      try {
        const [projRes, allRes] = await Promise.all([
          fetch(`/api/credit-pause?projectSlug=${project.slug}`),
          fetch("/api/credit-pause?all=true"),
        ]);
        if (projRes.ok) {
          const data = await projRes.json();
          setPaused(data.paused);
        }
        if (allRes.ok) {
          const data = await allRes.json();
          setAnyPaused(data.paused);
          setFocused(data.focusedProject === project.slug);
        }
      } catch {}
    }
    fetchPauseState();
    const interval = setInterval(fetchPauseState, 10_000);
    return () => clearInterval(interval);
  }, [project.slug]);

  async function togglePause() {
    setPauseLoading(true);
    try {
      if (paused) {
        await fetch(`/api/credit-pause?projectSlug=${project.slug}`, { method: "DELETE" });
        setPaused(false);
      } else {
        await fetch(`/api/credit-pause?projectSlug=${project.slug}`, { method: "PUT" });
        setPaused(true);
      }
    } catch {}
    setPauseLoading(false);
  }

  async function resumeAll() {
    setPauseLoading(true);
    try {
      await fetch("/api/credit-pause?all=true", { method: "DELETE" });
      setPaused(false);
      setAnyPaused(false);
      setFocused(false);
    } catch {}
    setPauseLoading(false);
  }

  async function toggleFocus() {
    setPauseLoading(true);
    try {
      if (focused) {
        // Already focused here — unfocus = resume all
        await fetch("/api/credit-pause?all=true", { method: "DELETE" });
        setPaused(false);
        setAnyPaused(false);
        setFocused(false);
      } else {
        // Focus on THIS project — pause everything else, resume this one
        // 1. Resume all first (clears any previous focus)
        await fetch("/api/credit-pause?all=true", { method: "DELETE" });
        // 2. Get all projects
        const projRes = await fetch("/api/projects");
        if (!projRes.ok) throw new Error("Failed to fetch projects");
        const { projects: allProjects } = await projRes.json();
        // 3. Pause every project except this one
        const pausePromises = (allProjects as { slug: string }[])
          .filter((p) => p.slug !== project.slug)
          .map((p) =>
            fetch(`/api/credit-pause?projectSlug=${p.slug}`, { method: "PUT" })
          );
        await Promise.all(pausePromises);
        // 4. Store the focused project slug
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: "focused_project", value: project.slug }),
        });
        setPaused(false);
        setAnyPaused(true);
        setFocused(true);
      }
    } catch (err) {
      console.error("[focus]", err);
    }
    setPauseLoading(false);
  }

  const previewEnabled = shippedCount >= 1 && hasCommands;

  async function handlePreview() {
    if (previewMode) {
      onPreviewToggle();
      return;
    }

    if (!previewEnabled) {
      setSettingsNotice(t.board.previewNotConfigured);
      setSettingsOpen(true);
      return;
    }

    setPreviewing(true);
    onPreviewStart();
    try {
      const res = await fetch(`/api/projects/${project.id}/preview`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.details
          ? `${t.board.buildFailed}\n${data.details}`
          : data.error || t.board.previewFailed;
        onPreviewError(msg);
        setSettingsNotice(msg);
        setSettingsOpen(true);
        setPreviewing(false);
        return;
      }
      const url = data.url.replace('0.0.0.0', 'localhost');
      if (!data.alreadyRunning) {
        await new Promise((r) => setTimeout(r, 3000));
      }
      onPreviewReady(url);
    } catch (err) {
      console.error("[preview]", err);
      onPreviewError(t.board.failedToStartPreview);
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <>
      {/* Play/Pause agents */}
      <button
          onClick={togglePause}
          disabled={pauseLoading}
          title={paused ? t.board.resumeAgents : t.board.pauseAgents}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: paused ? "rgba(239,68,68,0.12)" : "var(--bg-input)",
            border: `1px solid ${paused ? "rgba(239,68,68,0.4)" : "var(--border-medium)"}`,
            color: paused ? "#f87171" : "var(--text-secondary)",
            opacity: pauseLoading ? 0.5 : 1,
            cursor: pauseLoading ? "wait" : "pointer",
          }}
        >
          {paused ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          )}
          {paused ? t.board.paused : t.board.pause}
        </button>

        {/* Focus — pause all other projects, keep this one running */}
        <button
          onClick={toggleFocus}
          disabled={pauseLoading}
          title={focused ? "Unfocus — resume all projects" : "Focus — pause all other projects"}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            backgroundColor: focused ? "rgba(234, 179, 8, 0.15)" : "var(--bg-input)",
            border: `1px solid ${focused ? "rgba(234, 179, 8, 0.5)" : "var(--border-medium)"}`,
            color: focused ? "#facc15" : "var(--text-secondary)",
            opacity: pauseLoading ? 0.5 : 1,
            cursor: pauseLoading ? "wait" : "pointer",
            ...(focused ? { boxShadow: "0 0 12px rgba(234, 179, 8, 0.25)" } : {}),
          }}
        >
          {focused ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="4" />
              <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
              <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
            </svg>
          )}
          {focused ? "Focused" : "Focus"}
        </button>

        {anyPaused && !focused && (
          <button
            onClick={resumeAll}
            disabled={pauseLoading}
            title="Resume all paused projects"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.4)",
              color: "#4ade80",
              opacity: pauseLoading ? 0.5 : 1,
              cursor: pauseLoading ? "wait" : "pointer",
            }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Resume All
          </button>
        )}

        <button
          onClick={handlePreview}
          disabled={previewing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: previewMode ? "rgba(91, 141, 249, 0.1)" : "var(--bg-input)",
            border: previewMode ? "1px solid var(--accent-blue)" : "1px solid var(--border-medium)",
            color: previewMode ? "var(--accent-blue)" : "var(--text-secondary)",
            opacity: (previewEnabled && !previewing) || previewMode ? 1 : 0.4,
            cursor: previewing ? "wait" : (previewEnabled || previewMode) ? "pointer" : "not-allowed",
          }}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          {previewing ? t.board.starting : previewMode ? t.board.closePreview : t.board.preview}
        </button>

        <button
          onClick={() => router.push(`/p/${project.slug}/new-ticket`)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--accent-blue)" }}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t.board.addTicket}
        </button>

      <ProjectSettingsModal
        open={settingsOpen}
        onClose={() => { setSettingsOpen(false); setSettingsNotice(""); }}
        project={project}
        notice={settingsNotice}
      />
    </>
  );
}
