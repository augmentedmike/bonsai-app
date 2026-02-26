"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Project, Ticket, Persona } from "@/types";
import { BoardActions } from "./board-actions";
import { ProjectInfoPanel } from "./project-info-panel";
import { ProjectSelector } from "./project-selector";
import { BoardView } from "./board-view";

interface BoardContainerProps {
  project: Project;
  allProjects: Project[];
  tickets: Ticket[];
  personas: Persona[];
  ticketStats: { planning: number; building: number; shipped: number };
  awakePersonaIds: string[];
}

export function BoardContainer({
  project,
  allProjects,
  tickets,
  personas,
  ticketStats,
  awakePersonaIds,
}: BoardContainerProps) {
  const router = useRouter();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [startingPreview, setStartingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  // Hydrate chatOpen from localStorage client-side
  useEffect(() => {
    try {
      setChatOpen(localStorage.getItem("bonsai-chat-open") === "true");
    } catch {}
  }, []);

  // Esc → projects index (only when no modal/input is capturing the key)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (document.querySelector('[role="dialog"]')) return;
      router.push("/");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  function setChat(open: boolean) {
    setChatOpen(open);
    try { localStorage.setItem("bonsai-chat-open", String(open)); } catch {}
  }
  const [chatMentionPersonaId, setChatMentionPersonaId] = useState<string | null>(null);
  const [hideOnHold, setHideOnHold] = useState(false);
  const [holdCount, setHoldCount] = useState(() =>
    tickets.filter((t) => t.onHold && !t.isEpic).length
  );

  // Hydrate hideOnHold from localStorage client-side
  useEffect(() => {
    try {
      setHideOnHold(localStorage.getItem("bonsai-hide-on-hold") === "true");
    } catch {}
  }, []);

  function handlePreviewStart() {
    setStartingPreview(true);
    setPreviewError(null);
  }

  function handlePreviewReady(url: string) {
    setPreviewUrl(url);
    setStartingPreview(false);
    setPreviewError(null);
  }

  function handlePreviewError(error: string) {
    setPreviewError(error);
    setStartingPreview(false);
    setPreviewUrl(null);
  }

  function handlePreviewClose() {
    setPreviewUrl(null);
    setStartingPreview(false);
    setPreviewError(null);
  }

  function handleHideOnHoldChange(v: boolean) {
    setHideOnHold(v);
    try { localStorage.setItem("bonsai-hide-on-hold", String(v)); } catch {}
  }

  function handleSwitch(newSlug: string) {
    router.push(`/p/${newSlug}/board`);
  }

  const actionsNode = (
    <>
      <button
        onClick={() => setChat(!chatOpen)}
        className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs font-medium flex-shrink-0"
        style={{
          backgroundColor: chatOpen ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)",
          color: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(255,255,255,0.22)",
          boxShadow: chatOpen
            ? "0 0 10px rgba(255,255,255,0.35), 0 0 20px rgba(255,255,255,0.12)"
            : undefined,
          animation: !chatOpen ? "chat-btn-pulse 2.8s ease-in-out infinite" : "none",
          transition: "background-color 150ms, box-shadow 150ms",
        }}
        title="Toggle project chat"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
        Chat
      </button>
      <style>{`
        @keyframes chat-btn-pulse {
          0%, 100% { box-shadow: 0 0 4px rgba(255,255,255,0.1); }
          50% { box-shadow: 0 0 10px rgba(255,255,255,0.35), 0 0 18px rgba(255,255,255,0.15); }
        }
      `}</style>
      <BoardActions
        project={project}
        shippedCount={ticketStats.shipped}
        hasCommands={!!(project.buildCommand && project.runCommand)}
        previewMode={!!previewUrl || startingPreview}
        onPreviewToggle={handlePreviewClose}
        onPreviewStart={handlePreviewStart}
        onPreviewReady={handlePreviewReady}
        onPreviewError={handlePreviewError}
      />
    </>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Single combined header row */}
      <div
        className="flex items-center gap-2 px-4 py-1.5 border-b flex-shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <ProjectSelector
          project={project}
          allProjects={allProjects}
          onSwitch={handleSwitch}
        />
        <ProjectInfoPanel
          project={project}
          personas={personas}
          ticketStats={ticketStats}
          awakePersonaIds={new Set(awakePersonaIds)}
          onPersonaClick={(personaId) => router.push(`/p/${project.slug}/team?edit=${personaId}`)}
          onChatOpen={() => { setChatMentionPersonaId(null); setChat(true); }}
          hideOnHold={hideOnHold}
          onHideOnHoldChange={handleHideOnHoldChange}
          holdCount={holdCount}
          actionsSlot={actionsNode}
        />
      </div>

      <BoardView
        tickets={tickets}
        projectId={project.id}
        personas={personas}
        project={project}
        ticketStats={ticketStats}
        awakePersonaIds={awakePersonaIds}
        chatOpen={chatOpen}
        chatMentionPersonaId={chatMentionPersonaId}
        onChatClose={() => { setChat(false); setChatMentionPersonaId(null); }}
        hideOnHold={hideOnHold}
        onHoldCountChange={setHoldCount}
        previewUrl={previewUrl}
        startingPreview={startingPreview}
        previewError={previewError}
        onPreviewClose={handlePreviewClose}
      />
    </div>
  );
}
