"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { TicketType } from "@/types";
import { ticketTypes } from "@/lib/ticket-types";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { VoiceButton } from "@/components/voice-button";
import { extractPathsFromDrop, pathToMarkdown, type DroppedPath } from "@/lib/drop-paths";
import { DroppedPathBadges } from "@/components/dropped-path-badges";
// EPIC FEATURES DISABLED
// import { EpicBreakdownWizard } from "@/components/board/epic-breakdown-wizard";

interface NewTicketFormProps {
  projectId: string;
  projectSlug: string;
}

export function NewTicketForm({ projectId, projectSlug }: NewTicketFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketType | null>(null);
  // EPIC FEATURES DISABLED
  // const [isEpic, setIsEpic] = useState(false);
  // const [epicAutoSelected, setEpicAutoSelected] = useState(false);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingCriteria, setGeneratingCriteria] = useState(false);

  const [dragOver, setDragOver] = useState(false);
  const [images, setImages] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const [fileAttachments, setFileAttachments] = useState<{ id: string; name: string; dataUrl: string; mimeType: string }[]>([]);
  const [droppedPaths, setDroppedPaths] = useState<DroppedPath[]>([]);
  // EPIC FEATURES DISABLED
  // const [wizardEpic, setWizardEpic] = useState<{ id: number; title: string } | null>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const pendingVoiceBlurRef = useRef(false);

  const voice = useVoiceInput({
    onTranscript: useCallback((text: string) => {
      setDescription(text);
      pendingVoiceBlurRef.current = true;
    }, []),
  });

  const criteriaVoice = useVoiceInput({
    onTranscript: useCallback((text: string) => setAcceptanceCriteria(text), []),
    aiField: "massage_criteria",
  });

  function addFiles(files: File[]) {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const nonImageFiles = files.filter((f) => !f.type.startsWith("image/"));

    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImages((prev) => [...prev, { id: crypto.randomUUID(), name: file.name, dataUrl }]);
      };
      reader.readAsDataURL(file);
    });

    nonImageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setFileAttachments((prev) => [...prev, { id: crypto.randomUUID(), name: file.name, dataUrl, mimeType: file.type || "application/octet-stream" }]);
        setDescription((prev) => {
          const ref = `[Attached: ${file.name}]`;
          return prev ? `${prev}\n${ref}` : ref;
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function handleDescDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setDragOver(false);

    // Try to extract local file/folder paths (Finder drag)
    const paths = extractPathsFromDrop(e.dataTransfer);
    if (paths.length > 0) {
      setDroppedPaths((prev) => [...prev, ...paths]);
      const markdown = paths.map(pathToMarkdown).join("\n");
      setDescription((prev) => prev ? `${prev}\n\n${markdown}` : markdown);
      return;
    }

    // Fall back to file content handling (images, attachments)
    addFiles(Array.from(e.dataTransfer.files));
  }

  function handleDescPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = Array.from(e.clipboardData.items).filter((i) => i.type.startsWith("image/"));
    if (items.length === 0) return;
    e.preventDefault();
    const files = items.map((i) => i.getAsFile()).filter(Boolean) as File[];
    addFiles(files);
  }

  // EPIC FEATURES DISABLED
  // Auto-select Epic when total content is long (likely a large, multi-part ticket)
  // const EPIC_THRESHOLD = 500;
  // useEffect(() => {
  //   const totalLen = (description + title + acceptanceCriteria).length;
  //   if (totalLen >= EPIC_THRESHOLD && !isEpic && !epicAutoSelected) {
  //     setIsEpic(true);
  //     setType(null);
  //     setEpicAutoSelected(true);
  //   }
  // }, [description, title, acceptanceCriteria, isEpic, epicAutoSelected]);

  const accent = type ? ticketTypes[type].color : "var(--badge-feature)";

  async function generateFromDescription() {
    if (!description.trim()) return;
    const jobs: Promise<void>[] = [];

    // Helper to add timeout to fetch
    const fetchWithTimeout = (url: string, options: RequestInit, timeout = 30000) => {
      return Promise.race([
        fetch(url, options),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
      ]);
    };

    if (!title.trim()) {
      jobs.push((async () => {
        setGeneratingTitle(true);
        try {
          const res = await fetchWithTimeout("/api/generate-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: description.trim(), field: "title" }),
          }, 30000);
          if (!res.ok) {
            const error = await res.text();
            console.error("Failed to generate title:", error);
            return;
          }
          const data = await res.json();
          if (data.title) setTitle(data.title);
        } catch (err) {
          console.error("Error generating title:", err);
        } finally {
          setGeneratingTitle(false);
        }
      })());
    }
    if (!acceptanceCriteria.trim()) {
      jobs.push((async () => {
        setGeneratingCriteria(true);
        try {
          const res = await fetchWithTimeout("/api/generate-title", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: description.trim(), field: "criteria" }),
          }, 30000);
          if (!res.ok) {
            const error = await res.text();
            console.error("Failed to generate criteria:", error);
            return;
          }
          const data = await res.json();
          if (data.criteria) setAcceptanceCriteria(data.criteria);
        } catch (err) {
          console.error("Error generating criteria:", err);
        } finally {
          setGeneratingCriteria(false);
        }
      })());
    }
    await Promise.all(jobs);
  }

  useEffect(() => {
    if (pendingVoiceBlurRef.current && description.trim()) {
      pendingVoiceBlurRef.current = false;
      generateFromDescription();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description]);

  async function handleCreate() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        type: type || "feature",
        description: description.trim() || undefined,
        acceptanceCriteria: acceptanceCriteria.trim() || undefined,
        projectId,
        // EPIC FEATURES DISABLED
        // isEpic: isEpic || undefined,
      }),
    });
    const data = await res.json();
    const ticketId = data.ticket?.id;
    // Upload attached images and file attachments
    const allAttachments = [
      ...images.map((img) => ({ name: img.name, dataUrl: img.dataUrl, mimeType: img.dataUrl.split(";")[0].split(":")[1] || "image/png" })),
      ...fileAttachments.map((f) => ({ name: f.name, dataUrl: f.dataUrl, mimeType: f.mimeType })),
    ];
    if (ticketId && allAttachments.length > 0) {
      await Promise.all(allAttachments.map(async (att) => {
        try {
          const res = await fetch(`/api/tickets/${ticketId}/attachments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: att.name,
              mimeType: att.mimeType,
              data: att.dataUrl,
              createdByType: "human",
            }),
          });
          if (!res.ok) {
            console.error(`Failed to upload attachment ${att.name}:`, res.status, await res.text());
          }
        } catch (err) {
          console.error(`Failed to upload attachment ${att.name}:`, err);
        }
      }));
    }
    // EPIC FEATURES DISABLED
    // if (isEpic && ticketId) {
    //   setWizardEpic({ id: ticketId, title: title.trim() });
    //   setSaving(false);
    //   return;
    // }
    router.push(`/p/${projectSlug}${ticketId ? `?openTicket=${ticketId}` : ""}`);
  }

  // EPIC FEATURES DISABLED
  // if (wizardEpic) {
  //   return (
  //     <EpicBreakdownWizard
  //       epicId={wizardEpic.id}
  //       epicTitle={wizardEpic.title}
  //       projectSlug={projectSlug}
  //       projectId={projectId}
  //       onClose={() => router.push(`/p/${projectSlug}`)}
  //     />
  //   );
  // }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: "var(--bg-primary)" }}>

      {/* Body — two columns */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: main content */}
        <div className="flex-1 flex flex-col px-10 py-8 gap-6 overflow-y-auto min-h-0">
          {/* Description */}
          <div className="flex flex-col" style={{ height: "50vh" }}>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Description</label>
              <VoiceButton voice={voice} />
            </div>
            <div className="relative flex-1 min-h-0">
              <textarea
                ref={descRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => generateFromDescription()}
                onDrop={handleDescDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onPaste={handleDescPaste}
                placeholder={voice.isRecording ? voice.interimTranscript || "Listening..." : ticketTypes[type || "feature"].placeholder}
                autoFocus
                disabled={voice.isProcessingAI}
                className="w-full h-full px-5 py-4 rounded-lg text-base leading-relaxed outline-none transition-all resize-none bg-[var(--bg-input)] border text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                style={{ borderColor: dragOver ? "var(--accent-blue)" : undefined }}
              />
              {voice.isProcessingAI && (
                <div className="absolute inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Cleaning up your description...
                  </div>
                </div>
              )}
            </div>
            {/* Image thumbnails */}
            {images.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="relative group rounded-md overflow-hidden border border-[var(--border-medium)]"
                    style={{ width: 72, height: 72, flexShrink: 0 }}
                  >
                    <img src={img.dataUrl} alt={img.name} className="w-full h-full object-cover" />
                    <button
                      onClick={() => setImages((prev) => prev.filter((i) => i.id !== img.id))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* File attachment badges */}
            {fileAttachments.length > 0 && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {fileAttachments.map((f) => (
                  <div
                    key={f.id}
                    className="relative group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border-medium)] bg-[var(--bg-input)]"
                  >
                    <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <span className="text-xs truncate max-w-[120px]" style={{ color: "var(--text-secondary)" }}>{f.name}</span>
                    <button
                      onClick={() => {
                        setFileAttachments((prev) => prev.filter((a) => a.id !== f.id));
                        setDescription((prev) => prev.replace(`[Attached: ${f.name}]`, "").replace(/\n{2,}/g, "\n").trim());
                      }}
                      className="w-4 h-4 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    >
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {/* Dropped path badges */}
            <DroppedPathBadges
              paths={droppedPaths}
              onRemove={(id) => {
                const removed = droppedPaths.find((p) => p.id === id);
                setDroppedPaths((prev) => prev.filter((p) => p.id !== id));
                if (removed) {
                  setDescription((prev) => prev.replace(pathToMarkdown(removed), "").replace(/\n{3,}/g, "\n\n").trim());
                }
              }}
            />
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
              Title
              {generatingTitle && (
                <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">generating...</span>
              )}
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={generatingTitle ? "Generating title..." : "Auto-generated from description"}
              className="w-full px-5 py-4 rounded-lg text-lg outline-none transition-all bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-semibold focus:border-[var(--accent-blue)]"
            />
          </div>

          {/* Acceptance Criteria */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                Acceptance criteria
                {generatingCriteria && (
                  <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">generating...</span>
                )}
              </label>
              <VoiceButton voice={criteriaVoice} />
            </div>
            <div className="relative flex-1">
              <textarea
                value={acceptanceCriteria}
                onChange={(e) => setAcceptanceCriteria(e.target.value)}
                placeholder={criteriaVoice.isRecording ? criteriaVoice.interimTranscript || "Listening..." : generatingCriteria ? "Generating criteria..." : ticketTypes[type || "feature"].criteriaPlaceholder}
                disabled={criteriaVoice.isProcessingAI}
                className="flex-1 w-full h-full px-5 py-4 rounded-lg text-base leading-relaxed outline-none transition-all resize-none bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] min-h-[240px] focus:border-[var(--accent-blue)]"
              />
              {criteriaVoice.isProcessingAI && (
                <div className="absolute inset-0 bg-[var(--bg-primary)]/80 backdrop-blur-sm rounded-lg flex items-center justify-center">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Formatting criteria...
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: metadata sidebar */}
        <div
          className="w-72 flex flex-col px-6 py-8 gap-6 border-l overflow-y-auto"
          style={{ borderLeftColor: "var(--border-subtle)", backgroundColor: "var(--bg-secondary)" }}
        >
          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">Type</label>
            <div className="flex flex-col gap-2">
              {/* EPIC FEATURES DISABLED */}
              {/* Epic option */}
              {/* <button
                onClick={() => { setIsEpic(true); setType(null); setEpicAutoSelected(true); }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-left border"
                style={{
                  backgroundColor: isEpic ? "color-mix(in srgb, #f97316 15%, transparent)" : "transparent",
                  borderColor: isEpic ? "#f97316" : "var(--border-medium)",
                  color: isEpic ? "#f97316" : "var(--text-secondary)",
                }}
              >
                Epic
              </button> */}
              {(Object.keys(ticketTypes) as TicketType[]).map((key) => {
                const opt = ticketTypes[key];
                const selected = type === key;
                return (
                  <button
                    key={key}
                    onClick={() => setType(key)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors text-left border"
                    style={{
                      backgroundColor: selected ? `color-mix(in srgb, ${opt.color} 15%, transparent)` : "transparent",
                      borderColor: selected ? opt.color : "var(--border-medium)",
                      color: selected ? opt.color : "var(--text-secondary)",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">Artifacts</label>
            <div className="rounded-lg px-4 py-3 text-xs bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
              No artifacts yet. Research and plan docs will appear here.
            </div>
          </div>

          <div className="mt-auto pt-6">
            <button
              onClick={handleCreate}
              disabled={!title.trim() || saving}
              className="w-full px-8 py-3 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              {saving ? "Creating..." : `Create ${ticketTypes[type || "feature"].label.toLowerCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
