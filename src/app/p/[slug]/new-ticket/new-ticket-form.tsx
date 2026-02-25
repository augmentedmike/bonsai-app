"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
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

const STORAGE_KEY_PREFIX = "bonsai-new-ticket-";

function loadDraft(slug: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + slug);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDraft(slug: string, draft: { title: string; description: string; type: TicketType | null; acceptanceCriteria: string }) {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + slug, JSON.stringify(draft));
  } catch { /* quota exceeded — ignore */ }
}

function clearDraft(slug: string) {
  try { localStorage.removeItem(STORAGE_KEY_PREFIX + slug); } catch {}
}

export function NewTicketForm({ projectId, projectSlug }: NewTicketFormProps) {
  const router = useRouter();
  const draft = useRef(loadDraft(projectSlug)).current;
  const [title, setTitle] = useState(draft?.title ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [type, setType] = useState<TicketType | null>(draft?.type ?? "feature");
  // EPIC FEATURES DISABLED
  // const [isEpic, setIsEpic] = useState(false);
  // const [epicAutoSelected, setEpicAutoSelected] = useState(false);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(draft?.acceptanceCriteria ?? "");
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
  const [descExpanded, setDescExpanded] = useState(false);
  const [descIdleSeconds, setDescIdleSeconds] = useState(0);
  const descIdleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const descLastKeystrokeRef = useRef<number>(Date.now());
  const lastGeneratedDescRef = useRef<string>("");

  // Idle timer: counts seconds since last keystroke while expanded
  useEffect(() => {
    if (descExpanded) {
      descLastKeystrokeRef.current = Date.now();
      setDescIdleSeconds(0);
      descIdleTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - descLastKeystrokeRef.current) / 1000);
        setDescIdleSeconds(elapsed);
      }, 1000);
    } else {
      setDescIdleSeconds(0);
      if (descIdleTimerRef.current) clearInterval(descIdleTimerRef.current);
    }
    return () => { if (descIdleTimerRef.current) clearInterval(descIdleTimerRef.current); };
  }, [descExpanded]);

  function handleDescKeystroke() {
    descLastKeystrokeRef.current = Date.now();
    setDescIdleSeconds(0);
  }

  function collapseDesc() {
    setDescExpanded(false);
    generateFromDescription();
  }

  // Auto-save draft to localStorage on every change
  useEffect(() => {
    saveDraft(projectSlug, { title, description, type, acceptanceCriteria });
  }, [projectSlug, title, description, type, acceptanceCriteria]);

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

  function insertAtCursor(text: string) {
    const ta = descRef.current;
    if (!ta) {
      setDescription((prev: string) => prev ? `${prev}\n${text}` : text);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = description.slice(0, start);
    const after = description.slice(end);
    const needsNewline = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    const inserted = `${before}${needsNewline}${text}\n${after}`;
    setDescription(inserted);
    // Restore cursor after the inserted text
    requestAnimationFrame(() => {
      const pos = before.length + needsNewline.length + text.length + 1;
      ta.setSelectionRange(pos, pos);
      ta.focus();
    });
  }

  function addFiles(files: File[]) {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const nonImageFiles = files.filter((f) => !f.type.startsWith("image/"));

    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImages((prev) => [...prev, { id: Math.random().toString(36).slice(2) + Date.now().toString(36), name: file.name, dataUrl }]);
        insertAtCursor(`![${file.name}](attachment)`);
      };
      reader.readAsDataURL(file);
    });

    nonImageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setFileAttachments((prev) => [...prev, { id: Math.random().toString(36).slice(2) + Date.now().toString(36), name: file.name, dataUrl, mimeType: file.type || "application/octet-stream" }]);
        insertAtCursor(`[Attached: ${file.name}]`);
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
      setDescription((prev: string) => prev ? `${prev}\n\n${markdown}` : markdown);
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

  async function generateFromDescription(force = false) {
    if (!description.trim()) return;
    // Skip if description hasn't changed since last generation (unless forced)
    if (!force && description.trim() === lastGeneratedDescRef.current) return;
    lastGeneratedDescRef.current = description.trim();
    const jobs: Promise<void>[] = [];

    // Helper to add timeout to fetch
    const fetchWithTimeout = (url: string, options: RequestInit, timeout = 60000) => {
      return Promise.race([
        fetch(url, options),
        new Promise<Response>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        )
      ]);
    };

    if (force || !title.trim()) {
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
    if (force || !acceptanceCriteria.trim()) {
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
    // Always infer type from description
    jobs.push((async () => {
      try {
        const res = await fetchWithTimeout("/api/generate-title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: description.trim(), field: "type" }),
        }, 30000);
        if (!res.ok) return;
        const data = await res.json();
        const inferred = data.type?.trim()?.toLowerCase();
        if (inferred === "feature" || inferred === "bug" || inferred === "chore") {
          setType(inferred as TicketType);
        }
      } catch (err) {
        console.error("Error inferring type:", err);
      }
    })());
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
    clearDraft(projectSlug);
    router.push(`/p/${projectSlug}?openTicket=${ticketId}`);
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

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col px-10 py-8 pb-24 gap-6 overflow-y-auto min-h-0">
          {/* Clear all */}
          <div className="flex justify-end -mb-4">
            <button
              onClick={() => {
                setTitle("");
                setDescription("");
                setType("feature");
                setAcceptanceCriteria("");
                setImages([]);
                setFileAttachments([]);
                setDroppedPaths([]);
                clearDraft(projectSlug);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-white/5"
              style={{ color: "var(--text-muted)" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
              Clear all
            </button>
          </div>

          {/* Description */}
          <div
            data-desc-container
            className="flex flex-col"
            onClick={(e) => {
              // Clicking the backdrop area (not textarea/buttons) collapses
              if (descExpanded && e.target === e.currentTarget) collapseDesc();
            }}
            style={{
              ...(descExpanded
                ? { position: "fixed", inset: 0, zIndex: 50, padding: 24, backgroundColor: "var(--bg-primary)", transition: "all 300ms ease" }
                : { height: "50vh", transition: "all 300ms ease" }),
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--text-secondary)]">Description</label>
              <div className="flex items-center gap-2">
                {descExpanded && (
                  <button
                    onClick={collapseDesc}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors hover:bg-white/10"
                    style={{ color: "var(--text-muted)" }}
                    title="Restore"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                    </svg>
                    Restore
                  </button>
                )}
                <VoiceButton voice={voice} />
              </div>
            </div>
            <div
              className="relative flex-1 min-h-0"
              onClick={() => { if (!descExpanded) setDescExpanded(true); }}
              onDrop={handleDescDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
            >
              <textarea
                ref={descRef}
                value={description}
                onChange={(e) => { setDescription(e.target.value); handleDescKeystroke(); }}
                onBlur={(e) => {
                  if (!descExpanded) { generateFromDescription(); return; }
                  // If focus moved to a button inside the desc container, don't collapse
                  const container = e.currentTarget.closest('[data-desc-container]');
                  if (container && e.relatedTarget && container.contains(e.relatedTarget as Node)) return;
                  collapseDesc();
                }}
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
            {/* Collapse arrow — visible only in expanded mode */}
            {descExpanded && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={collapseDesc}
                  className="transition-all duration-300"
                  title="Done — collapse description"
                  style={{
                    color: descIdleSeconds >= 6 ? "var(--accent-green, #22c55e)" : "var(--text-muted)",
                    animation: descIdleSeconds >= 10 ? "bounce 1s ease infinite" : "none",
                  }}
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            )}
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
                        setDescription((prev: string) => prev.replace(`[Attached: ${f.name}]`, "").replace(/\n{2,}/g, "\n").trim());
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
                  setDescription((prev: string) => prev.replace(pathToMarkdown(removed), "").replace(/\n{3,}/g, "\n\n").trim());
                }
              }}
            />
          </div>

          {/* Divider + Regen */}
          <div className="flex flex-col items-center gap-2">
            <hr className="w-full border-t" style={{ borderColor: "var(--border-subtle)" }} />
            <button
              onClick={() => generateFromDescription(true)}
              disabled={!description.trim() || generatingTitle || generatingCriteria}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: "var(--text-muted)" }}
              title="Regenerate title and acceptance criteria from description"
            >
              <svg className={`w-3.5 h-3.5 ${generatingTitle || generatingCriteria ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              {generatingTitle || generatingCriteria ? "Regenerating..." : "Regen"}
            </button>
          </div>

          {/* Title + Type row */}
          <div>
            <label className="block text-sm font-medium mb-2 text-[var(--text-secondary)]">
              Title
              {generatingTitle && (
                <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">generating...</span>
              )}
            </label>
            <div className="flex items-stretch gap-3">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={generatingTitle ? "Generating title..." : "Auto-generated from description"}
                className="flex-1 px-5 rounded-lg text-lg outline-none transition-all bg-[var(--bg-input)] border border-[var(--border-medium)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] font-semibold focus:border-[var(--accent-blue)]"
              />
              <div className="flex gap-1.5">
              {(Object.keys(ticketTypes) as TicketType[]).map((key) => {
                const opt = ticketTypes[key];
                const selected = type === key;
                return (
                  <button
                    key={key}
                    onClick={() => setType(key)}
                    className="px-4 py-4 rounded-lg text-sm font-medium transition-colors border whitespace-nowrap"
                    style={{
                      backgroundColor: selected ? `color-mix(in srgb, ${opt.color} 15%, transparent)` : "transparent",
                      borderColor: selected ? opt.color : "var(--border-medium)",
                      color: selected ? opt.color : "var(--text-muted)",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
              </div>
            </div>
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
      </div>

      {/* Sticky create button — bottom right */}
      <div className="fixed bottom-8 right-8 z-40">
        <button
          onClick={handleCreate}
          disabled={!title.trim() || saving}
          className="px-8 py-3 rounded-lg text-sm font-medium text-white shadow-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          style={{ backgroundColor: accent }}
        >
          {saving ? "Creating..." : `Create ${ticketTypes[type || "feature"].label.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
