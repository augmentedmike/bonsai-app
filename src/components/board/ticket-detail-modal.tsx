"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { formatTicketSlug } from "@/types";
import type { Ticket, TicketType, TicketState, Comment, CommentAttachment, TicketAttachment, Persona } from "@/types";
import { ticketTypes } from "@/lib/ticket-types";
import { formatRelativeTime } from "@/lib/time-format";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { VoiceButton } from "@/components/voice-button";
import { CommentInput } from "@/components/board/comment-input";
import { FileBrowser } from "@/components/board/file-browser";
import { extractPathsFromDrop, pathToMarkdown, type DroppedPath } from "@/lib/drop-paths";
import { DroppedPathBadges } from "@/components/dropped-path-badges";

interface TicketDetailModalProps {
  ticket: Ticket | null;
  initialDocType?: "research" | "implementation_plan";
  projectId?: string;
  onClose: () => void;
  onDelete?: (ticketId: number) => void;
}

const typeOptions: TicketType[] = ["feature", "bug", "chore", "content", "story", "planning", "research"];
const stateOptions: TicketState[] = ["planning", "building", "shipped"];

// Board state mentions — referenceable via #planning, #building, etc.
const BOARD_STATES = [
  { name: "planning", label: "Planning", color: "var(--column-planning)", icon: "📋" },
  { name: "building", label: "Building", color: "var(--column-building)", icon: "🔨" },
  { name: "shipped", label: "Shipped", color: "var(--column-shipped)", icon: "🚀" },
] as const;
// Render comment text with highlighted @mentions (personas + team) and #columns (board states)
function renderCommentContent(text: string, personas: Persona[]) {
  const parts = text.split(/([@#][\w\p{L}-]+)/gu);
  return parts.map((part, i) => {
    if (part.startsWith("@")) return renderMentionSpan(part, i, personas);
    if (part.startsWith("#")) return renderHashSpan(part, i);
    return part;
  });
}

function renderMentionSpan(part: string, key: number | string, personas: Persona[]) {
  const name = part.slice(1).toLowerCase();
  if (name === "team") {
    return (
      <span key={key} style={{
        backgroundColor: "color-mix(in srgb, #10b981 20%, transparent)",
        color: "#10b981",
        padding: "1px 6px",
        borderRadius: "4px",
        fontSize: "0.8em",
        fontWeight: 600,
      }}>
        👥 @team
      </span>
    );
  }
  const persona = personas.find((p) => p.name.toLowerCase() === name || p.role?.toLowerCase() === name);
  if (persona) {
    return (
      <span key={key} style={{
        backgroundColor: `color-mix(in srgb, ${persona.color || "#6366f1"} 20%, transparent)`,
        color: persona.color || "#a78bfa",
        padding: "1px 6px",
        borderRadius: "4px",
        fontSize: "0.8em",
        fontWeight: 600,
      }}>
        @{persona.name}
      </span>
    );
  }
  return part;
}

function renderHashSpan(part: string, key: number | string) {
  const name = part.slice(1).toLowerCase();
  const board = BOARD_STATES.find((b) => b.name === name);
  if (board) {
    return (
      <span key={key} style={{
        backgroundColor: `color-mix(in srgb, ${board.color} 20%, transparent)`,
        color: board.color,
        padding: "1px 6px",
        borderRadius: "4px",
        fontSize: "0.8em",
        fontWeight: 600,
      }}>
        {board.icon} #{board.label}
      </span>
    );
  }
  return part;
}

// Process React children recursively to highlight @mentions and #columns inside ReactMarkdown output
function highlightMentionsInChildren(children: React.ReactNode, personas: Persona[]): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      const parts = child.split(/([@#][\w\p{L}-]+)/gu);
      if (parts.length === 1) return child;
      return parts.map((part, i) => {
        if (part.startsWith("@")) return renderMentionSpan(part, `m${i}`, personas);
        if (part.startsWith("#")) return renderHashSpan(part, `h${i}`);
        return part;
      });
    }
    return child;
  });
}

export function TicketDetailModal({ ticket, initialDocType, projectId, onClose, onDelete }: TicketDetailModalProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("");
  const [generatingCriteria, setGeneratingCriteria] = useState(false);
  const [type, setType] = useState<TicketType>("feature");
  const [state, setState] = useState<TicketState>("planning");

  // Epic state
  const [isEpic, setIsEpic] = useState(false);
  const [epicChildren, setEpicChildren] = useState<Array<{ id: string; title: string; type: string; state: string }>>([]);
  const [showCreateChild, setShowCreateChild] = useState(false);
  const [newChildTitle, setNewChildTitle] = useState("");
  const [creatingChild, setCreatingChild] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [processingAttachmentId, setProcessingAttachmentId] = useState<number | null>(null);
  const [attachmentDragOver, setAttachmentDragOver] = useState(false);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [, setTimestampTick] = useState(0); // Force re-render for timestamp updates

  // Personas list (for @mention autocomplete in CommentInput)
  const [personasList, setPersonasList] = useState<Persona[]>([]);

  // Dispatch debounce: accumulate comments, send one dispatch after a pause
  const dispatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDispatchContent = useRef<string[]>([]);

  // Typing indicator: shows agent avatar + animated dots while waiting for response (supports multiple agents)
  const [typingPersonas, setTypingPersonas] = useState<Array<{ name: string; color?: string; avatarUrl?: string }>>([]);
  const [docTypingPersona, setDocTypingPersona] = useState<{ name: string; color?: string; avatarUrl?: string } | null>(null);
  const typingTimeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const docTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Text attachment viewer state
  const [textViewerAttachment, setTextViewerAttachment] = useState<{ filename: string; content: string } | null>(null);
  const [loadingTextAttachment, setLoadingTextAttachment] = useState(false);

  // Live preview state
  const [viewMode, setViewMode] = useState<"info" | "preview" | "files">("info");
  const [project, setProject] = useState<{ buildCommand?: string; runCommand?: string; id?: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [startingPreview, setStartingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0); // Force iframe refresh

  // Reset viewMode to info and stop preview when ticket state changes
  const prevStateRef = useRef<TicketState | null>(null);
  useEffect(() => {
    if (ticket) {
      // If state changed and we're in preview mode, switch back to info
      if (prevStateRef.current !== null && prevStateRef.current !== ticket.state && viewMode === "preview") {
        setViewMode("info");
        setPreviewUrl(null);
        setStartingPreview(false);
        setPreviewError(null);
      }
      prevStateRef.current = ticket.state;
    }
  }, [ticket?.state, viewMode]);

  // Start preview server when switching to preview mode (in ticket's worktree)
  useEffect(() => {
    if (viewMode === "preview" && ticket && !previewUrl && !startingPreview && !previewError) {
      setStartingPreview(true);
      setPreviewError(null);
      fetch(`/api/tickets/${ticket.id}/start-preview`, { method: "POST" })
        .then(res => res.json())
        .then(data => {
          if (data.error) {
            setPreviewError(data.error + (data.details ? `\n${data.details}` : ''));
            setStartingPreview(false);
          } else if (data.url) {
            const url = data.url.replace('0.0.0.0', 'localhost');

            // If server was just started (not already running), wait for it to be ready
            if (!data.alreadyRunning) {
              setTimeout(() => {
                setPreviewUrl(url);
                setStartingPreview(false);
              }, 3000);
            } else {
              setPreviewUrl(url);
              setStartingPreview(false);
            }
          } else {
            setStartingPreview(false);
          }
        })
        .catch(err => {
          console.error("Failed to start preview:", err);
          setPreviewError("Failed to start preview server");
          setStartingPreview(false);
        });
    }
  }, [viewMode, ticket, previewUrl, startingPreview, previewError]);

  // Description cleanup state
  const [enhancingDescription, setEnhancingDescription] = useState(false);
  const descOnFocusRef = useRef<string>("");
  const descAlreadyEnhancedRef = useRef(false);
  const [droppedPaths, setDroppedPaths] = useState<DroppedPath[]>([]);
  const [descDragOver, setDescDragOver] = useState(false);

  // Local lifecycle state (from ticket prop, refreshed after actions)
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  // Document-related state removed — constants to keep conditional checks working
  const expandedDoc: any = null;
  const documents: any[] = [];
  const loadingDocuments = false;
  const approvingResearch = false;
  const approvingPlan = false;

  // Audit log state
  const [auditLog, setAuditLog] = useState<Array<{
    id: number;
    ticketId: string;
    event: string;
    actorType: string;
    actorId: string | null;
    actorName: string;
    detail: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Version selector (legacy, kept for compat)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  // Voice input hooks
  const descVoice = useVoiceInput({
    onTranscript: useCallback((text: string) => setDescription(text), []),
  });
  const criteriaVoice = useVoiceInput({
    onTranscript: useCallback((text: string) => setAcceptanceCriteria(text), []),
    aiField: "massage_criteria",
  });

  // Quote-to-comment state — popup uses refs (no re-render) to preserve selection
  const quotePopupRef = useRef<HTMLDivElement>(null);
  const quoteTextRef = useRef<string>("");
  const [quoteModalText, setQuoteModalText] = useState<string | null>(null);
  const [quoteComment, setQuoteComment] = useState("");
  const [postingQuote, setPostingQuote] = useState(false);
  const docBodyRef = useRef<HTMLDivElement>(null);

  // Document-scoped comments state (separate from ticket-level comments)
  const [docComments, setDocComments] = useState<Comment[]>([]);
  const [loadingDocComments, setLoadingDocComments] = useState(false);
  const docCommentsEndRef = useRef<HTMLDivElement>(null);

  // Baseline values for dirty-checking (description baseline updates after AI enhancement)
  const baselineRef = useRef({ title: "", description: "", acceptanceCriteria: "", type: "" as TicketType, state: "" as TicketState });
  const hasChanges = ticket ? (
    title !== baselineRef.current.title ||
    description !== baselineRef.current.description ||
    acceptanceCriteria !== baselineRef.current.acceptanceCriteria ||
    type !== baselineRef.current.type ||
    state !== baselineRef.current.state
  ) : false;

  // Clear lightbox when modal closes
  useEffect(() => {
    if (!ticket) {
      setLightboxImage(null);
    }
  }, [ticket]);

  // Initialize form when a *different* ticket is opened (by ID, not reference)
  const ticketId = ticket?.id;
  useEffect(() => {
    if (ticket && ticketId) {
      descAlreadyEnhancedRef.current = false;
      setTitle(ticket.title);
      setDescription(ticket.description || "");
      // Parse existing dropped paths from description markdown
      const pathRegex = /\*\*(.+?)\*\* `(.+?)`/g;
      const parsed: DroppedPath[] = [];
      let match;
      while ((match = pathRegex.exec(ticket.description || "")) !== null) {
        if (match[2].startsWith("/")) {
          parsed.push({ id: Math.random().toString(36).slice(2) + Date.now().toString(36), name: match[1], path: match[2] });
        }
      }
      setDroppedPaths(parsed);
      setAcceptanceCriteria(ticket.acceptanceCriteria || "");
      setType(ticket.type);
      setState(ticket.state);
      setIsEpic(ticket.isEpic ?? false);
      setEpicChildren([]);
      setShowCreateChild(false);
      setNewChildTitle("");
      if (ticket.isEpic) loadEpicChildren(ticket.id);
      baselineRef.current = {
        title: ticket.title,
        description: ticket.description || "",
        acceptanceCriteria: ticket.acceptanceCriteria || "",
        type: ticket.type,
        state: ticket.state,
      };
      loadComments(ticket.id);
      loadAttachments(ticket.id);
      loadPersonas();
      loadProject();

      // Clear any pending dispatch from previous ticket
      if (dispatchTimerRef.current) {
        clearTimeout(dispatchTimerRef.current);
        dispatchTimerRef.current = null;
      }
      pendingDispatchContent.current = [];

    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, ticket?.state]);

  // Backport: auto-generate acceptance criteria for existing tickets missing it
  useEffect(() => {
    if (!ticket || !ticketId) return;
    if (ticket.acceptanceCriteria?.trim()) return;
    if (!ticket.description?.trim()) return;

    let cancelled = false;
    setGeneratingCriteria(true);
    fetch("/api/generate-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: ticket.description.trim(), field: "criteria" }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data.criteria) return;
        setAcceptanceCriteria(data.criteria);
        // Persist to the ticket so it's only generated once
        fetch(`/api/tickets`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticketId, acceptanceCriteria: data.criteria }),
        }).catch(() => {});
      })
      .catch((err) => console.error("Failed to backfill criteria:", err))
      .finally(() => { if (!cancelled) setGeneratingCriteria(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!ticket) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (textViewerAttachment) {
          setTextViewerAttachment(null);
        } else if (lightboxImage) {
          setLightboxImage(null);
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [ticket, onClose, lightboxImage]);

  // Single 30s polling interval: comments + attachments + (audit when panel open)
  // Consolidating from 3 separate intervals (10s/10s/15s) → one 30s interval
  // reduces server load from ~8 req/min to ~2 req/min per open modal.
  useEffect(() => {
    if (!ticketId) return;
    const poll = setInterval(async () => {
      // Poll comments
      try {
        const res = await fetch(`/api/comments?ticketId=${ticketId}`);
        const data = await res.json();
        const fresh = data.comments || [];
        setComments((prev) => {
          if (fresh.length !== prev.length) {
            // Agent responded — clear their typing indicator
            const newComment = fresh[fresh.length - 1];
            if (newComment?.author?.name) {
              setTypingPersonas(current => current.filter(p => p.name !== newComment.author.name));
              const timeout = typingTimeoutRefs.current.get(newComment.author.name);
              if (timeout) {
                clearTimeout(timeout);
                typingTimeoutRefs.current.delete(newComment.author.name);
              }
            }
            setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            return fresh;
          }
          return prev;
        });
      } catch { /* skip cycle */ }

      // Poll attachments
      try {
        const res = await fetch(`/api/tickets/${ticketId}/attachments`);
        const data = await res.json();
        const fresh = data || [];
        setAttachments((prev) => {
          if (fresh.length !== prev.length) return fresh;
          return prev;
        });
      } catch { /* skip cycle */ }

      // Poll audit log only when activity panel is visible
      if (showActivity) {
        fetch(`/api/tickets/${ticketId}/audit`)
          .then((r) => r.json())
          .then((data) => setAuditLog(data.audit || []))
          .catch(() => {});
      }
    }, 30_000);
    return () => clearInterval(poll);
  }, [ticketId, showActivity]);

  // Load audit log immediately when activity panel opens (poll handles subsequent refreshes)
  useEffect(() => {
    if (ticketId && showActivity) loadAuditLog(ticketId);
  }, [ticketId, showActivity]);

  // Update timestamps every 30 seconds to keep relative times accurate
  useEffect(() => {
    const interval = setInterval(() => {
      setTimestampTick((prev) => prev + 1);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);


  async function loadComments(ticketId: number) {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/comments?ticketId=${ticketId}`);
      const data = await res.json();
      setComments(data.comments || []);
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } finally {
      setLoadingComments(false);
    }
  }


  async function loadAttachments(ticketId: number) {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/attachments`);
      const data = await res.json();
      setAttachments(data || []);
    } catch (error) {
      console.error("Failed to load attachments:", error);
    }
  }

  async function loadAuditLog(ticketId: number) {
    setLoadingAudit(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/audit`);
      const data = await res.json();
      setAuditLog(data.audit || []);
    } finally {
      setLoadingAudit(false);
    }
  }

  async function loadEpicChildren(tid: number) {
    try {
      const res = await fetch(`/api/tickets/${tid}/children`);
      const data = await res.json();
      setEpicChildren(Array.isArray(data) ? data : []);
    } catch { /* non-critical */ }
  }

  async function handleToggleEpic() {
    if (!ticket) return;
    const newValue = !isEpic;
    setIsEpic(newValue);
    await fetch("/api/tickets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: ticket.id, isEpic: newValue }),
    });
    if (newValue) {
      loadEpicChildren(ticket.id);
      // Auto-dispatch lead to break down the epic
      handleAIBreakdown();
    } else {
      setEpicChildren([]);
    }
    router.refresh();
  }

  async function handleCreateChild() {
    if (!ticket || !newChildTitle.trim()) return;
    setCreatingChild(true);
    try {
      await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newChildTitle.trim(),
          type: ticket.type,
          epicId: ticket.id,
        }),
      });
      setNewChildTitle("");
      setShowCreateChild(false);
      loadEpicChildren(ticket.id);
      router.refresh();
    } finally {
      setCreatingChild(false);
    }
  }

  const [breakingDown, setBreakingDown] = useState(false);
  async function handleAIBreakdown() {
    if (!ticket) return;
    setBreakingDown(true);
    try {
      const epicSummary = `${ticket.title}${ticket.description ? `\n\n${ticket.description}` : ""}${ticket.acceptanceCriteria ? `\n\nAcceptance Criteria:\n${ticket.acceptanceCriteria}` : ""}`;
      await fetch(`/api/tickets/${ticket.id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentContent: `This is an epic ticket. Break it down into smaller, focused sub-tickets using the create-sub-ticket tool. Each sub-ticket should be a single, independently workable item.\n\nEpic:\n${epicSummary}`,
          targetRole: "researcher",
        }),
      });
      // Poll for children after a delay (agent takes time)
      setTimeout(() => loadEpicChildren(ticket.id), 5000);
      setTimeout(() => loadEpicChildren(ticket.id), 15000);
      setTimeout(() => loadEpicChildren(ticket.id), 30000);
    } finally {
      setBreakingDown(false);
    }
  }

  async function loadPersonas() {
    try {
      const url = projectId ? `/api/personas?projectId=${projectId}` : "/api/personas";
      const res = await fetch(url);
      const data = await res.json();
      setPersonasList(Array.isArray(data) ? data : []);
    } catch {
      // non-critical — autocomplete just won't work
    }
  }

  async function loadProject() {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
      }
    } catch {
      // non-critical — preview toggle just won't show
    }
  }


  function handleDescDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    e.preventDefault();
    setDescDragOver(false);
    const paths = extractPathsFromDrop(e.dataTransfer);
    if (paths.length > 0) {
      setDroppedPaths((prev) => [...prev, ...paths]);
      const markdown = paths.map(pathToMarkdown).join("\n");
      setDescription((prev) => prev ? `${prev}\n\n${markdown}` : markdown);
    }
  }

  async function enhanceDescription() {
    if (!description.trim()) return;
    // Only enhance once per ticket — don't keep rewriting on every blur
    if (descAlreadyEnhancedRef.current) return;
    descAlreadyEnhancedRef.current = true;
    setEnhancingDescription(true);
    try {
      const res = await fetch("/api/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), field: "enhance" }),
      });
      const data = await res.json();
      if (data.enhance) {
        setDescription(data.enhance);
        baselineRef.current.description = data.enhance;
      }
    } catch (err) {
      console.error("[enhanceDescription] error:", err);
    } finally {
      setEnhancingDescription(false);
    }
  }



  // Accept ticket (test → ship)
  const [accepting, setAccepting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  async function handleAcceptTicket() {
    if (!ticket) return;
    setAccepting(true);
    try {
      // Ship endpoint merges worktree branch into main, cleans up, and sets state
      const res = await fetch(`/api/tickets/${ticket.id}/ship`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Ship failed" }));
        alert(`Ship failed: ${data.error || res.statusText}`);
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setAccepting(false);
    }
  }

  async function handlePreview() {
    if (!ticket) return;
    setPreviewing(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/preview`, { method: "POST" });
      const data = await res.json();
      if (data.url) {
        // Small delay to let server start if freshly spawned
        if (!data.alreadyRunning) {
          await new Promise((r) => setTimeout(r, 2000));
        }
        window.open(data.url, "_blank");
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function handleRebuildPreview() {
    if (!ticket || rebuilding) return;
    setRebuilding(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/rebuild-preview`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(`Rebuild failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Rebuild failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRebuilding(false);
    }
  }

  const ROLE_SLUGS = ["designer", "developer", "critic", "researcher", "hacker"];

  // Extract ALL @mentioned persona names from comment text
  // Supports both @Name and @role (e.g., @designer, @lead, @researcher)
  function extractAllMentionedPersonas(text: string): Array<{ name?: string; role?: string; team?: boolean }> {
    const lower = text.toLowerCase();
    const mentions: Array<{ name?: string; role?: string; team?: boolean }> = [];

    // Check @team
    if (lower.includes("@team")) {
      mentions.push({ team: true });
    }

    // Check all persona names (sort by length desc so longer names match first)
    const sorted = [...personasList].sort((a, b) => b.name.length - a.name.length);
    const foundNames = new Set<string>();
    for (const p of sorted) {
      if (lower.includes(`@${p.name.toLowerCase()}`) && !foundNames.has(p.name)) {
        mentions.push({ name: p.name });
        foundNames.add(p.name);
      }
    }

    // Check all role slugs
    const foundRoles = new Set<string>();
    for (const role of ROLE_SLUGS) {
      if (lower.includes(`@${role}`) && !foundRoles.has(role)) {
        mentions.push({ role });
        foundRoles.add(role);
      }
    }

    return mentions;
  }

  // Legacy: Extract first @mentioned persona (kept for backward compatibility)
  function extractMentionedPersona(text: string): { name?: string; role?: string; team?: boolean } {
    const all = extractAllMentionedPersonas(text);
    return all[0] || {};
  }

  // Detect if comment is conversational (short question/chat) vs. a work directive
  function isConversationalComment(text: string): boolean {
    const trimmed = text.trim();

    // Short comments (under 200 chars) are likely conversational
    if (trimmed.length < 200) {
      // Question patterns
      if (/\?$/.test(trimmed)) return true;
      if (/^(what|how|why|when|where|who|can|could|would|should|do|does|did|is|are|was|were)/i.test(trimmed)) return true;
      // Greeting/acknowledgment patterns
      if (/^(thanks|thank you|got it|ok|okay|sure|yes|no|lgtm|approved)/i.test(trimmed)) return true;
    }

    // Long detailed requests are not conversational (work directives)
    return false;
  }

  // Debounced dispatch: batches multiple rapid comments into a single agent dispatch
  function queueDispatch(commentContent: string, opts?: { conversational?: boolean; documentId?: number; isDocComment?: boolean; targetPersonaId?: string }) {
    if (!ticket) return;
    const tid = ticket.id;
    pendingDispatchContent.current.push(commentContent);

    if (dispatchTimerRef.current) {
      clearTimeout(dispatchTimerRef.current);
    }

    const doDispatch = async () => {
      const batch = pendingDispatchContent.current.splice(0);
      if (batch.length === 0) return;
      const combined = batch.join("\n\n---\n\n");
      const mentions = extractAllMentionedPersonas(combined);

      // If no mentions, dispatch generically
      if (mentions.length === 0) {
        mentions.push({});
      }

      // Dispatch to ALL mentioned personas
      for (const mention of mentions) {
        try {
          const dispatchRes = await fetch(`/api/tickets/${tid}/dispatch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ commentContent: combined, targetPersonaName: mention.name, targetRole: mention.role, targetPersonaId: opts?.targetPersonaId, team: mention.team, conversational: opts?.conversational, documentId: opts?.documentId, silent: true }),
          });
          const dispatchData = await dispatchRes.json();
          if (dispatchData.persona) {
            const persona = {
              name: dispatchData.persona.name,
              color: dispatchData.persona.color,
              avatarUrl: dispatchData.persona.avatarUrl,
            };
            if (opts?.isDocComment) {
              setDocTypingPersona(persona);
              if (docTypingTimeoutRef.current) clearTimeout(docTypingTimeoutRef.current);
              docTypingTimeoutRef.current = setTimeout(() => setDocTypingPersona(null), 120_000);
              setTimeout(() => docCommentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            } else {
              // Add to typing personas array
              setTypingPersonas(prev => {
                if (prev.some(p => p.name === persona.name)) return prev;
                return [...prev, persona];
              });
              // Set timeout to remove this persona after 2 minutes
              const existingTimeout = typingTimeoutRefs.current.get(persona.name);
              if (existingTimeout) clearTimeout(existingTimeout);
              const timeout = setTimeout(() => {
                setTypingPersonas(prev => prev.filter(p => p.name !== persona.name));
                typingTimeoutRefs.current.delete(persona.name);
              }, 120_000);
              typingTimeoutRefs.current.set(persona.name, timeout);
              setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            }
          }
        } catch {
          // dispatch failed silently
        }
      }
    };

    // For @mentions, dispatch immediately. For unmentioned comments, use 1s debounce.
    const mention = extractMentionedPersona(commentContent);
    const hasMention = mention.name || mention.role || mention.team;
    const delay = hasMention ? 0 : 1000; // 0ms for mentions, 1s for unmentioned

    dispatchTimerRef.current = setTimeout(doDispatch, delay);
  }

  async function handleCommentPost(text: string, attachments: CommentAttachment[]) {
    if (!ticket) return;
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticket.id,
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
    });
    const data = await res.json();
    if (data.comment) {
      setComments((prev) => [...prev, data.comment]);
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      const isConversational = isConversationalComment(text);
      queueDispatch(text, { conversational: isConversational });
    }
  }

  // Quote-to-comment: detect text selection in the doc viewer
  // Uses direct DOM manipulation (no setState) to avoid re-render clearing the selection
  function handleDocMouseUp() {
    const popup = quotePopupRef.current;
    if (!popup) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) {
      popup.style.display = "none";
      quoteTextRef.current = "";
      return;
    }
    const range = sel!.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    quoteTextRef.current = text;
    popup.style.display = "flex";
    popup.style.left = `${rect.left + rect.width / 2}px`;
    popup.style.top = `${rect.top - 10}px`;
  }

  function handleDocMouseDown(e: React.MouseEvent) {
    // Dismiss the quote popup if clicking outside it
    const popup = quotePopupRef.current;
    if (popup && popup.style.display !== "none" && !(e.target as HTMLElement).closest("[data-quote-popup]")) {
      popup.style.display = "none";
      quoteTextRef.current = "";
    }
  }

  async function handlePostQuoteComment() {
    if (!ticket || !quoteModalText || !quoteComment.trim()) return;
    setPostingQuote(true);
    const activeDoc = expandedDoc;
    const docLabel = activeDoc
      ? activeDoc.type === "research"
        ? `Research Document v${activeDoc.version}`
        : `Implementation Plan v${activeDoc.version}`
      : "Document";
    const quotedLines = quoteModalText.split("\n").map((l) => `> ${l}`).join("\n");
    const content = `${quotedLines}\n\n_(from ${docLabel})_\n\n${quoteComment}`;
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          content,
          documentId: expandedDoc?.id,
        }),
      });
      const data = await res.json();
      if (data.comment) {
        // Post to doc comments sidebar (keep doc viewer open)
        setDocComments((prev) => [...prev, data.comment]);
        setQuoteModalText(null);
        setQuoteComment("");
        setTimeout(() => docCommentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } finally {
      setPostingQuote(false);
    }
  }

  function isImageType(type: string) {
    return type.startsWith("image/");
  }


  async function handleDocCommentPost(text: string, attachments: CommentAttachment[]) {
    if (!ticket || !expandedDoc) return;
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: ticket.id,
        content: text,
        attachments: attachments.length > 0 ? attachments : undefined,
        documentId: expandedDoc.id,
      }),
    });
    const data = await res.json();
    if (data.comment) {
      setDocComments((prev) => [...prev, data.comment]);
      setTimeout(() => docCommentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      const docLabel = expandedDoc.type === "research" ? "research document" : (expandedDoc.type as string) === "design" ? "design document" : "implementation plan";
      queueDispatch(`[Comment on ${docLabel}] ${text}`, {
        conversational: true,
        documentId: expandedDoc.id,
        isDocComment: true,
        targetPersonaId: expandedDoc.authorPersonaId,
      });
    }
  }

  function getFileIcon(type: string) {
    if (type.includes("pdf")) return "PDF";
    if (type.includes("word") || type.includes("document")) return "DOC";
    if (type.includes("sheet") || type.includes("excel")) return "XLS";
    if (type.includes("presentation") || type.includes("powerpoint")) return "PPT";
    if (type.includes("zip") || type.includes("archive")) return "ZIP";
    if (type.includes("text")) return "TXT";
    if (type.includes("json")) return "JSON";
    if (type.includes("javascript") || type.includes("typescript")) return "JS";
    return "FILE";
  }

  async function handleSave() {
    if (!ticket) return;
    setSaving(true);
    try {
      await fetch("/api/tickets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: ticket.id,
          title,
          description,
          acceptanceCriteria,
          type,
          state,
        }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleShip() {
    if (!ticket) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/ship`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Ship failed: ${data.error || "Unknown error"}\n\nLog:\n${data.log?.join("\n") || ""}`);
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || !ticket) return;

    setUploadingAttachment(true);

    try {
      for (const file of Array.from(files)) {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });

        // Upload to API
        const res = await fetch(`/api/tickets/${ticket.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type,
            data: dataUrl,
            createdByType: "human",
            createdById: "1", // TODO: Get actual user ID
          }),
        });

        if (!res.ok) {
          console.error("Failed to upload attachment");
          continue;
        }

        const newAttachment = await res.json();
        setAttachments((prev) => [...prev, newAttachment]);
      }

      router.refresh();
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleAttachmentDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAttachmentDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (!files.length || !ticket) return;

    setUploadingAttachment(true);
    try {
      for (const file of files) {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.readAsDataURL(file);
        });

        const res = await fetch(`/api/tickets/${ticket.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            mimeType: file.type,
            data: dataUrl,
            createdByType: "human",
            createdById: "1",
          }),
        });

        if (!res.ok) {
          console.error("Failed to upload attachment");
          continue;
        }

        const newAttachment = await res.json();
        setAttachments((prev) => [...prev, newAttachment]);
      }
      router.refresh();
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function removeAttachment(id: number) {
    if (!ticket) return;

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/attachments/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setAttachments((prev) => prev.filter((a) => a.id !== id));
        router.refresh();
      }
    } catch (error) {
      console.error("Failed to delete attachment:", error);
    }
  }

  const TEXT_VIEWABLE_TYPES = new Set([
    "text/plain", "text/markdown", "application/json", "text/csv",
    "text/html", "text/xml", "application/xml",
  ]);

  async function openTextViewer(att: TicketAttachment) {
    if (!ticket) return;
    setLoadingTextAttachment(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/attachments/${att.id}`);
      const text = await res.text();
      let displayText = text;
      if (att.mimeType === "application/json") {
        try { displayText = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ }
      }
      setTextViewerAttachment({ filename: att.filename, content: displayText });
    } catch {
      console.error("Failed to load attachment text");
    } finally {
      setLoadingTextAttachment(false);
    }
  }

  async function applyTransparencyToAttachment(attachmentId: number) {
    if (!ticket) return;
    setProcessingAttachmentId(attachmentId);

    try {
      // Get the attachment URL
      const attachmentUrl = `/api/tickets/${ticket.id}/attachments/${attachmentId}`;

      // Load the image
      const img = new Image();
      img.crossOrigin = "anonymous";

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = attachmentUrl;
      });

      // Create canvas and get pixel data
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Process pixels: make 50% grey transparent
      const tolerance = 50; // Increased tolerance to catch more greys
      const greyTarget = 128;
      let pixelsChanged = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Check if pixel is close to 50% grey
        const isGrey =
          Math.abs(r - greyTarget) < tolerance &&
          Math.abs(g - greyTarget) < tolerance &&
          Math.abs(b - greyTarget) < tolerance &&
          Math.abs(r - g) < tolerance &&
          Math.abs(g - b) < tolerance;

        if (isGrey) {
          // Make it transparent
          data[i + 3] = 0;
          pixelsChanged++;
        }
      }

      console.log(`Made ${pixelsChanged} pixels transparent`);

      // Put the modified pixel data back
      ctx.putImageData(imageData, 0, 0);

      // Convert to PNG data URL
      const processedDataUrl = canvas.toDataURL("image/png");

      // Send to server to save
      const res = await fetch(`/api/tickets/${ticket.id}/attachments/${attachmentId}/transparency`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processedDataUrl }),
      });

      if (res.ok) {
        // Reload attachments to get the updated image
        await loadAttachments(ticket.id);
      }
    } catch (err) {
      console.error("Failed to apply transparency:", err);
    } finally {
      setProcessingAttachmentId(null);
    }
  }

  // Use centralized time formatting
  const formatTime = formatRelativeTime;

  if (!ticket || !mounted) return null;

  const typeStyle = ticketTypes[type as TicketType] ?? ticketTypes.feature;
  const currentColumn = BOARD_STATES.find((s) => s.name === state) || BOARD_STATES[0];

  const modal = (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ backgroundColor: "#0a0a0f" }}
    >
      {/* Two-column layout */}
      <div className="flex w-full h-full">
        {/* Left column - Ticket details */}
        <div
          className="flex-1 flex flex-col h-full overflow-hidden"
          style={{
            backgroundColor: "#0f0f1a",
            borderRight: "1px solid var(--border-medium)",
          }}
        >
          {/* Header - compact in files/preview mode */}
          <div
            className={`flex items-start justify-between border-b flex-shrink-0 ${viewMode === "files" || viewMode === "preview" ? "px-4 py-2" : "px-8 py-6"}`}
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="flex-1 pr-4">
              <div className={`flex items-center gap-3 ${viewMode === "files" || viewMode === "preview" ? "mb-0" : "mb-4"}`}>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as TicketType)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer appearance-none"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${typeStyle.bg} 15%, transparent)`,
                    color: typeStyle.text,
                    border: "none",
                    outline: "none",
                  }}
                >
                  {typeOptions.map((t) => (
                    <option key={t} value={t} style={{ backgroundColor: "#1a1a2e", color: "#fff" }}>
                      {ticketTypes[t].label}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  {formatTicketSlug(ticket.id)}
                </span>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value as TicketState)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer appearance-none"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${currentColumn.color} 20%, transparent)`,
                    color: currentColumn.color,
                    border: `1.5px solid color-mix(in srgb, ${currentColumn.color} 40%, transparent)`,
                    outline: "none",
                  }}
                >
                  {stateOptions.map((s) => {
                    const bs = BOARD_STATES.find((b) => b.name === s);
                    return (
                      <option key={s} value={s} style={{ backgroundColor: "#1a1a2e", color: "#fff" }}>
                        {bs?.icon} {bs?.label || s}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className={`flex items-center gap-4 ${viewMode === "files" || viewMode === "preview" ? "hidden" : ""}`}>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="flex-1 min-w-0 text-2xl font-bold leading-tight bg-transparent border-none outline-none"
                  style={{ color: "var(--text-primary)" }}
                  placeholder="Ticket title..."
                />
                {/* Participant avatar bubbles */}
                {(() => {
                  const seen = new Set<string>();
                  const participants: { id: string; name: string; color?: string; avatarUrl?: string; role?: string; isActive?: boolean }[] = [];
                  const activeRunIds = new Set(ticket.activeRunPersonaIds ?? []);
                  const activeMs = ticket.lastAgentActivity ? Date.now() - new Date(ticket.lastAgentActivity).getTime() : Infinity;
                  const legacyActive = activeMs < 30 * 60 * 1000;
                  // Assignee first
                  if (ticket.assignee) {
                    seen.add(ticket.assignee.id);
                    participants.push({
                      id: ticket.assignee.id,
                      name: ticket.assignee.name,
                      color: ticket.assignee.color,
                      avatarUrl: ticket.assignee.avatar,
                      role: ticket.assignee.role,
                      isActive: activeRunIds.size > 0 ? activeRunIds.has(ticket.assignee.id) : legacyActive
                    });
                  }
                  // All agent comment authors
                  for (const c of comments) {
                    if (c.authorType === "agent" && c.author?.name) {
                      const p = personasList.find(p => p.name === c.author!.name);
                      const key = p?.id ?? c.author.name;
                      if (seen.has(key)) continue;
                      seen.add(key);
                      participants.push({ id: key, name: c.author.name, color: p?.color ?? c.author.color, avatarUrl: p?.avatar ?? c.author.avatarUrl, role: p?.role ?? c.author.role, isActive: p ? activeRunIds.has(p.id) : false });
                    }
                  }
                  // Also add any running agents not yet in participants (e.g. dispatched but no comment yet)
                  for (const runId of activeRunIds) {
                    if (!seen.has(runId)) {
                      const p = personasList.find(p => p.id === runId);
                      if (p) {
                        seen.add(runId);
                        participants.push({ id: runId, name: p.name, color: p.color, avatarUrl: p.avatar, role: p.role, isActive: true });
                      }
                    }
                  }
                  if (participants.length === 0) return null;
                  return (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {participants.map((p) => (
                        <div key={p.id} className="flex items-center gap-1.5" title={`${p.name}${p.role ? ` — ${p.role}` : ""}`}>
                          <div className="relative w-7 h-7 rounded-full overflow-hidden flex-shrink-0" style={{ border: `2px solid ${p.color || "rgba(255,255,255,0.2)"}` }}>
                            {p.avatarUrl ? (
                              <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: p.color || "rgba(255,255,255,0.1)", color: "#fff" }}>
                                {p.name[0]}
                              </div>
                            )}
                            {p.isActive && (
                              <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-green-400 border border-black" />
                            )}
                          </div>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{p.name}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* EPIC FEATURES DISABLED - Make Epic toggle removed */}
              {/* Hold / Unhold toggle */}
              {ticket.state !== "shipped" && (
                <button
                  onClick={async () => {
                    if (!ticket) return;
                    if (ticket.onHold) {
                      await fetch(`/api/tickets/${ticket.id}/hold`, { method: "DELETE" });
                    } else {
                      await fetch(`/api/tickets/${ticket.id}/hold`, { method: "POST" });
                    }
                    router.refresh();
                  }}
                  className="h-10 px-4 rounded-lg flex items-center gap-2 transition-colors font-semibold text-sm"
                  style={ticket.onHold ? {
                    color: "#fbbf24",
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                    border: "1.5px solid rgba(245, 158, 11, 0.5)",
                  } : {
                    color: "var(--text-muted)",
                    backgroundColor: "transparent",
                  }}
                  title={ticket.onHold ? `On hold: ${ticket.holdReason || "unknown"} — click to resume` : "Put on hold"}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={ticket.onHold ? 2.5 : 1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                  </svg>
                  {ticket.onHold ? "On Hold" : "Hold"}
                </button>
              )}
              {/* Block / Unblock toggle */}
              {ticket.state !== "shipped" && (
                <button
                  onClick={async () => {
                    if (!ticket) return;
                    if (ticket.blocked) {
                      await fetch(`/api/tickets/${ticket.id}/block`, { method: "DELETE" });
                      router.refresh();
                    } else {
                      const reason = prompt("Why is this ticket blocked?", "Needs human intervention");
                      if (reason === null) return;
                      await fetch(`/api/tickets/${ticket.id}/block`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ reason }),
                      });
                      router.refresh();
                    }
                  }}
                  className="h-10 px-3 rounded-lg flex items-center gap-1.5 transition-colors"
                  style={{
                    color: ticket.blocked ? "#f87171" : "var(--text-muted)",
                    backgroundColor: ticket.blocked ? "rgba(239, 68, 68, 0.1)" : "transparent",
                  }}
                  title={ticket.blocked ? `Blocked: ${ticket.blockedReason || "unknown"} — click to unblock` : "Flag as blocked"}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {ticket.blocked && <span className="text-xs font-semibold">Blocked</span>}
                </button>
              )}
              {onDelete && (
                <button
                  onClick={async () => {
                    if (!ticket) return;
                    if (!confirm(`Delete ${formatTicketSlug(ticket.id)}?`)) return;
                    await fetch("/api/tickets", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ticketId: ticket.id }),
                    });
                    onDelete(ticket.id);
                    onClose();
                  }}
                  className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-red-500/10"
                  style={{ color: "var(--text-muted)" }}
                  title="Delete ticket"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              )}
              {/* Live preview toggle - enabled for building/shipped */}
              {(() => {
                const canPreview = ticket.state === "building" || ticket.state === "shipped";
                return (
                  <button
                    onClick={() => canPreview && setViewMode(viewMode === "info" ? "preview" : "info")}
                    disabled={!canPreview}
                    className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                    style={{
                      color: canPreview && viewMode === "preview" ? "var(--accent-blue)" : "var(--text-muted)",
                      backgroundColor: canPreview && viewMode === "preview" ? "rgba(59, 130, 246, 0.1)" : "transparent",
                      opacity: canPreview ? 1 : 0.4,
                      cursor: canPreview ? "pointer" : "not-allowed",
                    }}
                    title={
                      !canPreview ? "Live preview available when building" :
                      viewMode === "info" ? "Show live preview" : "Show ticket info"
                    }
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </button>
                );
              })()}
              {/* Files browser toggle */}
              <button
                onClick={() => setViewMode(viewMode === "files" ? "info" : "files")}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  color: viewMode === "files" ? "var(--accent-blue)" : "var(--text-muted)",
                  backgroundColor: viewMode === "files" ? "rgba(59, 130, 246, 0.1)" : "transparent",
                }}
                title={viewMode === "files" ? "Show ticket info" : "Browse repo files"}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                </svg>
              </button>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ color: "var(--text-muted)" }}
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body - scrollable */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-8">
            {/* Hold banner */}
            {ticket.onHold && (
              <div
                className="flex items-center gap-3 px-5 py-3.5 rounded-xl -mt-2"
                style={{
                  backgroundColor: "rgba(245, 158, 11, 0.12)",
                  border: "1.5px solid rgba(245, 158, 11, 0.35)",
                }}
              >
                <svg className="w-5 h-5 flex-shrink-0" style={{ color: "#fbbf24" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
                </svg>
                <div className="flex-1">
                  <span className="text-sm font-semibold" style={{ color: "#fbbf24" }}>On Hold</span>
                  {ticket.holdReason && (
                    <span className="text-sm ml-2" style={{ color: "var(--text-secondary)" }}>
                      — {ticket.holdReason}
                    </span>
                  )}
                </div>
                <button
                  onClick={async () => {
                    await fetch(`/api/tickets/${ticket.id}/hold`, { method: "DELETE" });
                    router.refresh();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: "rgba(245, 158, 11, 0.2)",
                    color: "#fbbf24",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                  }}
                >
                  Resume
                </button>
              </div>
            )}
            {viewMode === "preview" ? (
              /* Live preview iframe - auto-starts dev server if needed */
              <div className="h-full w-full -my-2 flex flex-col">
                {previewError ? (
                  <div className="flex items-center justify-center h-full p-8" style={{ color: "var(--text-secondary)" }}>
                    <div className="flex flex-col items-center gap-3 text-center max-w-md">
                      <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                      </svg>
                      <div>
                        <div className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Preview not available</div>
                        <pre className="text-xs text-left whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>{previewError}</pre>
                      </div>
                      <button
                        onClick={() => { setPreviewError(null); setViewMode("info"); }}
                        className="px-4 py-2 rounded-lg text-sm hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: "var(--bg-input)", color: "var(--text-secondary)" }}
                      >
                        Back to ticket
                      </button>
                    </div>
                  </div>
                ) : startingPreview ? (
                  <div className="flex items-center justify-center h-full" style={{ color: "var(--text-secondary)" }}>
                    <div className="flex flex-col items-center gap-3">
                      <svg className="animate-spin h-8 w-8" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-sm">Starting dev server...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Refresh button - Apple glass style */}
                    <div className="flex items-center justify-center py-3 px-8">
                      <button
                        onClick={() => setIframeKey(prev => prev + 1)}
                        className="p-2 rounded-full transition-all hover:scale-110 active:scale-95"
                        style={{
                          backgroundColor: "rgba(255, 255, 255, 0.1)",
                          backdropFilter: "blur(20px) saturate(180%)",
                          WebkitBackdropFilter: "blur(20px) saturate(180%)",
                          border: "1px solid rgba(255, 255, 255, 0.18)",
                          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.1)",
                        }}
                        title="Refresh preview"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          style={{ color: "rgba(255, 255, 255, 0.9)" }}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                          />
                        </svg>
                      </button>
                    </div>
                    <iframe
                      key={iframeKey}
                      src={previewUrl || `http://localhost:${3100 + (Number(projectId) % 100)}`}
                      className="flex-1 w-full border-0 rounded-xl"
                      title="Live Preview"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
                    />
                  </>
                )}
              </div>
            ) : viewMode === "files" ? (
              <div className="h-full w-full -mx-8 -my-6 p-4" style={{ minHeight: "500px" }}>
                <FileBrowser ticketId={ticket.id} />
              </div>
            ) : (
              <>
            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Description
                </label>
                <VoiceButton voice={descVoice} />
              </div>
              <div className="relative">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onFocus={() => { descOnFocusRef.current = description; }}
                  onBlur={() => { if (description !== descOnFocusRef.current && !descVoice.isRecording && !descVoice.isProcessingAI) enhanceDescription(); }}
                  onDrop={handleDescDrop}
                  onDragOver={(e) => { e.preventDefault(); setDescDragOver(true); }}
                  onDragLeave={() => setDescDragOver(false)}
                  rows={10}
                  disabled={descVoice.isProcessingAI || enhancingDescription}
                  className="w-full rounded-xl p-5 text-[15px] leading-relaxed resize-y min-h-[220px]"
                  style={{
                    backgroundColor: "var(--bg-input)",
                    border: `1px solid ${descDragOver ? "var(--accent-blue)" : "var(--border-medium)"}`,
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                  placeholder={descVoice.isRecording ? descVoice.interimTranscript || "Listening..." : "Describe what needs to be done..."}
                />
                {enhancingDescription && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(15, 15, 26, 0.85)", backdropFilter: "blur(4px)" }}>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Cleaning up description...
                    </div>
                  </div>
                )}
                {descVoice.isProcessingAI && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(15, 15, 26, 0.85)", backdropFilter: "blur(4px)" }}>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Cleaning up your description...
                    </div>
                  </div>
                )}
              </div>
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

            {/* Acceptance Criteria */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Acceptance Criteria
                </label>
                <VoiceButton voice={criteriaVoice} />
              </div>
              <div className="relative">
                <textarea
                  value={acceptanceCriteria}
                  onChange={(e) => setAcceptanceCriteria(e.target.value)}
                  rows={10}
                  disabled={criteriaVoice.isProcessingAI || generatingCriteria}
                  className="w-full rounded-xl p-5 text-sm font-mono leading-relaxed resize-y min-h-[220px]"
                  style={{
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid var(--border-medium)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                  placeholder={criteriaVoice.isRecording ? criteriaVoice.interimTranscript || "Listening..." : "- Criteria 1\n- Criteria 2\n- Criteria 3"}
                />
                {generatingCriteria && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(4px)" }}>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Generating acceptance criteria...
                    </div>
                  </div>
                )}
                {criteriaVoice.isProcessingAI && (
                  <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(0, 0, 0, 0.7)", backdropFilter: "blur(4px)" }}>
                    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
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

            {/* Sub-tickets (when epic) */}
            {isEpic && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold" style={{ color: "#fb923c" }}>
                    Sub-tickets
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAIBreakdown}
                      disabled={breakingDown}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:brightness-110"
                      style={{ backgroundColor: "rgba(249, 115, 22, 0.18)", color: "#fb923c" }}
                      title="Have @lead analyze this epic and create sub-tickets"
                    >
                      {breakingDown ? (
                        <>
                          <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Breaking down...
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                          </svg>
                          @lead break down
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowCreateChild(!showCreateChild)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}
                      title="Manually add a sub-ticket"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add manual
                    </button>
                  </div>
                </div>

                {/* Progress bar */}
                {epicChildren.length > 0 && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium" style={{ color: "#fb923c" }}>
                        {epicChildren.filter((c) => c.state === "shipped").length} / {epicChildren.length} shipped
                      </span>
                      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                        {Math.round((epicChildren.filter((c) => c.state === "shipped").length / epicChildren.length) * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(249, 115, 22, 0.15)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(epicChildren.filter((c) => c.state === "shipped").length / epicChildren.length) * 100}%`,
                          backgroundColor: "#fb923c",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Inline child creation form */}
                {showCreateChild && (
                  <div className="mb-4 flex items-center gap-2">
                    <input
                      type="text"
                      value={newChildTitle}
                      onChange={(e) => setNewChildTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleCreateChild(); if (e.key === "Escape") { setShowCreateChild(false); setNewChildTitle(""); } }}
                      placeholder="Sub-ticket title..."
                      autoFocus
                      className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                      style={{
                        backgroundColor: "var(--bg-input)",
                        border: "1px solid rgba(249, 115, 22, 0.3)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <button
                      onClick={handleCreateChild}
                      disabled={!newChildTitle.trim() || creatingChild}
                      className="px-3 py-2 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-40"
                      style={{ backgroundColor: "#f97316" }}
                    >
                      {creatingChild ? "..." : "Add"}
                    </button>
                  </div>
                )}

                {/* Children list */}
                {epicChildren.length > 0 ? (
                  <div className="space-y-2">
                    {epicChildren.map((child) => {
                      const childTypeStyle = ticketTypes[child.type as keyof typeof ticketTypes] || ticketTypes.feature;
                      const childState = BOARD_STATES.find((s) => s.name === child.state);
                      return (
                        <div
                          key={child.id}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors hover:bg-white/5"
                          style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)" }}
                          onClick={() => {
                            const url = new URL(window.location.href);
                            url.searchParams.set("openTicket", String(child.id));
                            window.location.href = url.toString();
                          }}
                        >
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
                            style={{
                              backgroundColor: `color-mix(in srgb, ${childTypeStyle.bg} 15%, transparent)`,
                              color: childTypeStyle.text,
                            }}
                          >
                            {childTypeStyle.label}
                          </span>
                          <span className="text-sm font-medium flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                            {child.title}
                          </span>
                          {childState && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
                              style={{
                                backgroundColor: `color-mix(in srgb, ${childState.color} 15%, transparent)`,
                                color: childState.color,
                              }}
                            >
                              {childState.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : !showCreateChild && !breakingDown ? (
                  <div
                    className="rounded-xl p-5 text-center text-sm"
                    style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
                  >
                    @lead is analyzing this epic and will create sub-tickets shortly...
                  </div>
                ) : null}
              </div>
            )}

            {/* Documents section removed — documents now stored as tagged attachments */}

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Attachments
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/10"
                  style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Upload
                </button>
                <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
              </div>

              {uploadingAttachment && (
                <div className="mb-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  Uploading...
                </div>
              )}

              {attachments.length === 0 ? (
                <div
                  className="rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors hover:bg-white/5"
                  style={{ border: `1px dashed ${attachmentDragOver ? "var(--accent-blue)" : "var(--border-medium)"}`, color: "var(--text-muted)", backgroundColor: attachmentDragOver ? "rgba(59,130,246,0.05)" : undefined }}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleAttachmentDrop}
                  onDragOver={(e) => { e.preventDefault(); setAttachmentDragOver(true); }}
                  onDragLeave={() => setAttachmentDragOver(false)}
                >
                  <svg className="w-6 h-6 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span className="text-xs">Drop files or click to upload</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {attachments.map((att) => {
                    const isImage = att.mimeType.startsWith("image/");
                    const attachmentUrl = `/api/tickets/${ticket?.id}/attachments/${att.id}`;

                    if (isImage) {
                      return (
                        <div
                          key={att.id}
                          className="relative group rounded-lg overflow-hidden cursor-pointer"
                          style={{
                            aspectRatio: '8.5 / 11',
                            backgroundImage: 'linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)',
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                            backgroundColor: '#1a1a1a'
                          }}
                          onClick={() => { setLightboxImage(`${attachmentUrl}?t=${Date.now()}`); }}
                        >
                          <img src={`${attachmentUrl}?t=${Date.now()}`} alt={att.filename} className="w-full h-full object-contain transition-transform group-hover:scale-105" />

                          {/* Transparency button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); applyTransparencyToAttachment(att.id); }}
                            disabled={processingAttachmentId === att.id}
                            className="absolute top-1 left-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.7)", opacity: processingAttachmentId === att.id ? 0.5 : undefined }}
                            title="Make 50% gray transparent"
                          >
                            {processingAttachmentId === att.id ? (
                              <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M16 10.5C16 11.3284 15.5523 12 15 12C14.4477 12 14 11.3284 14 10.5C14 9.67157 14.4477 9 15 9C15.5523 9 16 9.67157 16 10.5Z" fill="currentColor"/>
                                <ellipse cx="9" cy="10.5" rx="1" ry="1.5" fill="currentColor"/>
                                <path opacity="0.8" d="M22 19.723V12.3006C22 6.61173 17.5228 2 12 2C6.47715 2 2 6.61173 2 12.3006V19.723C2 21.0453 3.35098 21.9054 4.4992 21.314C5.42726 20.836 6.5328 20.9069 7.39614 21.4998C8.36736 22.1667 9.63264 22.1667 10.6039 21.4998L10.9565 21.2576C11.5884 20.8237 12.4116 20.8237 13.0435 21.2576L13.3961 21.4998C14.3674 22.1667 15.6326 22.1667 16.6039 21.4998C17.4672 20.9069 18.5727 20.836 19.5008 21.314C20.649 21.9054 22 21.0453 22 19.723Z" stroke="currentColor" strokeWidth="1.5"/>
                              </svg>
                            )}
                          </button>

                          {/* Download button */}
                          <a
                            href={attachmentUrl}
                            download={att.filename}
                            onClick={(e) => { e.stopPropagation(); }}
                            className="absolute top-1 left-8 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                            title="Download image"
                          >
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                            </svg>
                          </a>

                          {/* Delete button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); removeAttachment(att.id); }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                            title="Remove attachment"
                          >
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    } else {
                      // Non-image file badge — text-viewable files open in viewer
                      const isTextViewable = TEXT_VIEWABLE_TYPES.has(att.mimeType);
                      return (
                        <div
                          key={att.id}
                          onClick={() => isTextViewable ? openTextViewer(att) : undefined}
                          className="relative group rounded-lg p-3 flex flex-col items-center justify-center gap-1 transition-colors hover:bg-white/10"
                          style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid var(--border-subtle)", cursor: isTextViewable ? "pointer" : "default" }}
                        >
                          <svg className="w-6 h-6" style={{ color: isTextViewable ? "var(--accent-blue)" : "var(--text-muted)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          <span className="text-xs text-center truncate w-full" style={{ color: "var(--text-secondary)" }}>
                            {att.filename}
                          </span>
                          {isTextViewable && (
                            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Click to view</span>
                          )}
                          {!isTextViewable && (
                            <a href={attachmentUrl} download={att.filename} onClick={(e) => e.stopPropagation()} className="text-[10px] hover:underline" style={{ color: "var(--text-muted)" }}>
                              Download
                            </a>
                          )}
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeAttachment(att.id); }}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
                          >
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    }
                  })}
                  <div
                    className="aspect-square rounded-lg flex items-center justify-center cursor-pointer transition-colors hover:bg-white/10"
                    style={{ border: `1px dashed ${attachmentDragOver ? "var(--accent-blue)" : "var(--border-medium)"}`, color: "var(--text-muted)", backgroundColor: attachmentDragOver ? "rgba(59,130,246,0.05)" : undefined }}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleAttachmentDrop}
                    onDragOver={(e) => { e.preventDefault(); setAttachmentDragOver(true); }}
                    onDragLeave={() => setAttachmentDragOver(false)}
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                </div>
              )}
            </div>

            {/* Activity Timeline */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => setShowActivity(!showActivity)}
                  className="flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <svg
                    className="w-4 h-4 transition-transform"
                    style={{ transform: showActivity ? "rotate(90deg)" : "rotate(0deg)" }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Activity
                  {auditLog.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "var(--text-muted)" }}>
                      {auditLog.length}
                    </span>
                  )}
                </button>
                {auditLog.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/tickets/${ticketId}/audit`, { method: "DELETE" });
                      setAuditLog([]);
                    }}
                    className="text-[11px] transition-colors hover:opacity-80"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {showActivity && (
                <div
                  className="rounded-xl p-4 max-h-[300px] overflow-y-auto"
                  style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)" }}
                >
                  {loadingAudit ? (
                    <div className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>Loading activity...</div>
                  ) : auditLog.length === 0 ? (
                    <div className="text-xs text-center py-4" style={{ color: "var(--text-muted)" }}>No activity yet</div>
                  ) : (
                    <div className="relative" style={{ paddingLeft: "20px" }}>
                      {/* Timeline line */}
                      <div
                        className="absolute top-2 bottom-2"
                        style={{ left: "7px", width: "2px", backgroundColor: "var(--border-medium)" }}
                      />

                      {auditLog.map((entry) => {
                        const isAgent = entry.actorType === "agent";
                        const isSystem = entry.actorType === "system";
                        const dotColor = isAgent ? "#8b5cf6" : isSystem ? "var(--text-muted)" : "var(--accent-blue)";

                        // Format metadata inline
                        let metaStr = "";
                        if (entry.metadata) {
                          if (entry.metadata.from && entry.metadata.to) {
                            metaStr = `${entry.metadata.from} → ${entry.metadata.to}`;
                          } else if (entry.metadata.version) {
                            metaStr = `v${entry.metadata.version}`;
                          }
                        }

                        const timeStr = entry.createdAt
                          ? new Date(entry.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "";

                        return (
                          <div key={entry.id} className="relative mb-3 last:mb-0" style={{ paddingLeft: "12px" }}>
                            {/* Dot */}
                            <div
                              className="absolute rounded-full"
                              style={{
                                left: "-16.5px",
                                top: "6px",
                                width: "9px",
                                height: "9px",
                                backgroundColor: dotColor,
                                border: "2px solid rgba(15, 15, 26, 1)",
                              }}
                            />
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                                {timeStr}
                              </span>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                                style={{
                                  backgroundColor: isAgent ? "rgba(139, 92, 246, 0.15)" : isSystem ? "rgba(255,255,255,0.05)" : "rgba(59, 130, 246, 0.15)",
                                  color: isAgent ? "#a78bfa" : isSystem ? "var(--text-muted)" : "#93c5fd",
                                }}
                              >
                                {entry.actorName}
                              </span>
                            </div>
                            <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                              {entry.detail}
                              {metaStr && (
                                <span className="ml-2 font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                                  {metaStr}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Meta row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>State</label>
                <select
                  value={state}
                  onChange={(e) => setState(e.target.value as TicketState)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm cursor-pointer"
                  style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-medium)", color: "var(--text-primary)", outline: "none" }}
                >
                  {stateOptions.map((s) => (
                    <option key={s} value={s} style={{ backgroundColor: "#1a1a2e" }}>
                      {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Created</label>
                <div className="px-4 py-2.5 rounded-xl text-sm" style={{ backgroundColor: "var(--bg-input)", border: "1px solid var(--border-medium)", color: "var(--text-muted)" }}>
                  {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : "Unknown"}
                </div>
              </div>
            </div>

          {/* Build state preview bar */}
          {ticket.state === "building" && (
            <div
              className="mx-8 mb-4 rounded-xl p-5 flex items-center justify-between"
              style={{
                backgroundColor: "rgba(99, 102, 241, 0.08)",
                border: "1px solid rgba(99, 102, 241, 0.3)",
              }}
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" style={{ color: "#818cf8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97m-5.1 5.1H21" />
                </svg>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  Building
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Preview the work in progress
                </span>
              </div>
              <button
                onClick={handlePreview}
                disabled={previewing}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors hover:opacity-90"
                style={{
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  color: "#818cf8",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  opacity: previewing ? 0.5 : 1,
                }}
              >
                {previewing ? "Starting..." : "Preview"}
              </button>
            </div>
          )}

              </>
            )}
          </div>

          {/* Footer - hidden in files view to maximize file browser space */}
          <div className={`flex justify-end gap-3 px-8 py-5 border-t flex-shrink-0 ${viewMode === "files" ? "hidden" : ""}`} style={{ borderColor: "var(--border-subtle)" }}>
            {ticket?.state !== "building" && (
              <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium transition-colors hover:bg-white/5" style={{ color: "var(--text-secondary)" }}>
                Cancel
              </button>
            )}
            {ticket?.state === "building" && viewMode === "preview" && (
              <button
                onClick={handleRebuildPreview}
                disabled={rebuilding}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: rebuilding ? "rgba(249, 115, 22, 0.3)" : "rgba(249, 115, 22, 0.2)",
                  color: rebuilding ? "rgba(251, 146, 60, 0.6)" : "#fb923c",
                  opacity: rebuilding ? 0.5 : 1,
                  cursor: rebuilding ? "not-allowed" : "pointer",
                }}
              >
                {rebuilding ? "Rebuilding..." : "Rebuild & Run"}
              </button>
            )}
            <button
              onClick={ticket?.state === "building" ? handleShip : handleSave}
              disabled={saving || !title.trim() || (ticket?.state === "building" ? false : !hasChanges)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: "var(--accent-blue)", color: "#fff", opacity: saving || !title.trim() || (ticket?.state === "building" ? false : !hasChanges) ? 0.5 : 1 }}
            >
              {saving ? "Saving..." : ticket?.state === "building" ? "Accept and Ship" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Right column - Comments */}
        <div
          className="w-[420px] flex flex-col h-full flex-shrink-0"
          style={{ backgroundColor: "#0a0a12" }}
        >
          {/* Comments header */}
          <div className="px-6 py-5 border-b flex-shrink-0" style={{ borderColor: "var(--border-subtle)" }}>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Comments {comments.length > 0 && <span style={{ color: "var(--text-muted)" }}>({comments.length})</span>}
            </h3>
          </div>

          {/* Comments list */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {loadingComments ? (
              <div className="flex items-center justify-center py-12" style={{ color: "var(--text-muted)" }}>
                <span className="text-sm">Loading comments...</span>
              </div>
            ) : comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center" style={{ color: "var(--text-muted)" }}>
                <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <span className="text-sm">No comments yet</span>
                <span className="text-xs mt-1 opacity-60">Start the conversation below</span>
              </div>
            ) : (
              comments
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .map((comment) => (
                comment.authorType === "system" ? (
                  <div key={comment.id} className="flex items-center gap-2 py-1.5 px-2">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "var(--text-muted)" }} />
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <span>{children}</span>,
                          strong: ({ children }) => <strong className="font-semibold" style={{ color: "var(--text-secondary)" }}>{children}</strong>,
                        }}
                      >
                        {comment.content}
                      </ReactMarkdown>
                    </span>
                    <span className="text-xs ml-auto flex-shrink-0" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                      {formatTime(comment.createdAt)}
                    </span>
                  </div>
                ) : (
                <div key={comment.id} className="group">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: comment.author?.color || "var(--accent-indigo)" }}
                    >
                      {comment.author?.avatarUrl ? (
                        <img src={comment.author.avatarUrl} alt={comment.author.name} className="w-full h-full object-cover" />
                      ) : (
                        comment.author?.name?.[0]?.toUpperCase() || (comment.authorType === "agent" ? "A" : "H")
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                          {comment.author?.name || (comment.authorType === "agent" ? "Agent" : "Human")}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                          style={{
                            backgroundColor: comment.authorType === "agent" ? "rgba(139, 92, 246, 0.15)" : "rgba(59, 130, 246, 0.15)",
                            color: comment.authorType === "agent" ? "#a78bfa" : "#60a5fa",
                          }}
                        >
                          {comment.authorType === "agent" && comment.author?.role ? comment.author.role : comment.authorType}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {formatTime(comment.createdAt)}
                        </span>
                      </div>
                      {comment.content && (
                        comment.authorType === "agent" ? (
                          <div className="text-sm leading-relaxed comment-markdown" style={{ color: "rgba(255,255,255,0.8)" }}>
                            <ReactMarkdown
                              components={{
                                h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1.5" style={{ color: "#fff" }}>{children}</h1>,
                                h2: ({ children }) => <h2 className="text-[15px] font-bold mt-2.5 mb-1" style={{ color: "#fff" }}>{children}</h2>,
                                h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1" style={{ color: "rgba(255,255,255,0.95)" }}>{children}</h3>,
                                p: ({ children }) => <p className="mb-2 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>{highlightMentionsInChildren(children, personasList)}</p>,
                                strong: ({ children }) => <strong className="font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>{highlightMentionsInChildren(children, personasList)}</strong>,
                                em: ({ children }) => <em style={{ color: "rgba(255,255,255,0.65)" }}>{children}</em>,
                                code: ({ children, className }) => {
                                  const isBlock = className?.includes("language-");
                                  if (isBlock) {
                                    return <code className={`block whitespace-pre overflow-x-auto rounded-lg p-3 text-xs leading-relaxed ${className || ""}`} style={{ backgroundColor: "rgba(0,0,0,0.4)", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.06)" }}>{children}</code>;
                                  }
                                  return <code className="px-1 py-0.5 rounded text-xs" style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "#fbbf24" }}>{children}</code>;
                                },
                                pre: ({ children }) => <pre className="mb-2 rounded-lg overflow-hidden">{children}</pre>,
                                ul: ({ children }) => <ul className="list-disc ml-4 mb-2 space-y-0.5 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal ml-4 mb-2 space-y-0.5 text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>{children}</ol>,
                                li: ({ children }) => <li className="leading-relaxed">{highlightMentionsInChildren(children, personasList)}</li>,
                                blockquote: ({ children }) => <blockquote className="border-l-2 pl-3 my-2" style={{ borderColor: "rgba(99,102,241,0.5)", color: "rgba(255,255,255,0.65)" }}>{children}</blockquote>,
                                hr: () => <hr className="my-3" style={{ borderColor: "rgba(255,255,255,0.06)" }} />,
                                a: ({ href, children }) => <a href={href} className="underline" style={{ color: "#818cf8" }}>{children}</a>,
                              }}
                            >
                              {comment.content}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div
                            className="text-sm leading-relaxed whitespace-pre-wrap"
                            style={{ color: "rgba(255,255,255,0.8)" }}
                          >
                            {renderCommentContent(comment.content, personasList)}
                          </div>
                        )
                      )}
                      {/* Comment attachments */}
                      {comment.attachments && comment.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {comment.attachments.map((att, i) => (
                            isImageType(att.type) ? (
                              <img
                                key={i}
                                src={att.data}
                                alt={att.name}
                                className="max-w-[200px] max-h-[150px] rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setLightboxImage(att.data)}
                                style={{
                                  backgroundColor: "#1a1a1a",
                                  backgroundImage:
                                    "linear-gradient(45deg, #2a2a2a 25%, transparent 25%), " +
                                    "linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), " +
                                    "linear-gradient(45deg, transparent 75%, #2a2a2a 75%), " +
                                    "linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)",
                                  backgroundSize: "20px 20px",
                                  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
                                }}
                              />
                            ) : (
                              <div
                                key={i}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                                style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                              >
                                <span
                                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "var(--text-muted)" }}
                                >
                                  {getFileIcon(att.type)}
                                </span>
                                <span className="text-xs truncate max-w-[120px]" style={{ color: "var(--text-secondary)" }}>
                                  {att.name}
                                </span>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                )
              ))
            )}
            {/* Typing indicators (multiple agents supported) */}
            {typingPersonas.map((typingPersona) => (
              <div key={typingPersona.name} className="group">
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0 overflow-hidden"
                    style={{ backgroundColor: typingPersona.color || "var(--accent-indigo)" }}
                  >
                    {typingPersona.avatarUrl ? (
                      <img src={typingPersona.avatarUrl} alt={typingPersona.name} className="w-full h-full object-cover" />
                    ) : (
                      typingPersona.name?.[0]?.toUpperCase() || "A"
                    )}
                  </div>
                  <div className="flex items-center gap-1 py-2">
                    <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{typingPersona.name}</span>
                    <span className="flex gap-0.5 ml-1">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor: "var(--text-muted)",
                            animation: `typing-dot 1.4s infinite ${i * 0.2}s`,
                          }}
                        />
                      ))}
                    </span>
                    <style>{`
                      @keyframes typing-dot {
                        0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
                        30% { opacity: 1; transform: translateY(-3px); }
                      }
                    `}</style>
                  </div>
                </div>
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>

          {/* Comment input */}
          <CommentInput
            personasList={personasList}
            placeholder="Write a comment… @ to mention, # for columns"
            onPost={handleCommentPost}
            enableVoice
          />
        </div>
      </div>
    </div>
  );

  // Lightbox for full-size image viewing
  const lightbox = lightboxImage && (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-8"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.95)" }}
      onClick={() => { setLightboxImage(null); }}
    >
      <button
        onClick={() => { setLightboxImage(null); }}
        className="absolute top-6 right-6 w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
        style={{ color: "var(--text-muted)" }}
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
      <div
        className="max-w-full max-h-full flex items-center justify-center rounded-lg overflow-hidden"
        style={{
          backgroundImage: 'linear-gradient(45deg, #808080 25%, transparent 25%), linear-gradient(-45deg, #808080 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #808080 75%), linear-gradient(-45deg, transparent 75%, #808080 75%)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
          backgroundColor: '#404040'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={lightboxImage}
          alt="Full size"
          className="max-w-full max-h-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );

  // Full-screen document viewer removed — documents now stored as tagged attachments
  const displayDoc: any = null;
  const docViewer = null;

  // Quote comment modal (overlays the doc viewer)
  const quoteModal = quoteModalText && (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
      onClick={() => { setQuoteModalText(null); setQuoteComment(""); }}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl border"
        style={{ backgroundColor: "var(--bg-card)", borderColor: "var(--border-medium)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" style={{ color: "var(--accent-blue)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Comment on Quote
            </span>
          </div>
          <button
            onClick={() => { setQuoteModalText(null); setQuoteComment(""); }}
            className="w-7 h-7 rounded flex items-center justify-center hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Quoted text */}
          <div>
            <div className="text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
              {displayDoc
                ? displayDoc.type === "research"
                  ? `Research Document v${displayDoc.version}`
                  : `Implementation Plan v${displayDoc.version}`
                : "Document"}
            </div>
            <div
              className="border-l-2 pl-3 py-2 text-sm leading-relaxed rounded-r"
              style={{
                borderColor: "var(--accent-blue)",
                backgroundColor: "rgba(59, 130, 246, 0.06)",
                color: "rgba(255, 255, 255, 0.75)",
                maxHeight: "120px",
                overflowY: "auto",
              }}
            >
              {quoteModalText.length > 500 ? quoteModalText.slice(0, 500) + "..." : quoteModalText}
            </div>
          </div>

          {/* Comment textarea */}
          <textarea
            autoFocus
            value={quoteComment}
            onChange={(e) => setQuoteComment(e.target.value)}
            placeholder="Add your comment..."
            className="w-full rounded-lg px-3 py-2.5 text-sm resize-none outline-none"
            style={{
              backgroundColor: "var(--bg-input)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-medium)",
              minHeight: "80px",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault();
                handlePostQuoteComment();
              }
            }}
          />

          {/* Actions */}
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {postingQuote ? "Posting..." : "Enter to send · Shift+Enter for newline"}
            </span>
            <button
              onClick={() => { setQuoteModalText(null); setQuoteComment(""); }}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/5"
              style={{ color: "var(--text-secondary)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Text attachment viewer modal
  const textViewer = textViewerAttachment && (
    <div
      className="fixed inset-0 z-[60] flex flex-col"
      style={{ backgroundColor: "#0a0a0f" }}
    >
      <div
        className="flex items-center justify-between px-8 py-4 border-b flex-shrink-0"
        style={{ borderColor: "var(--border-subtle)", backgroundColor: "#0f0f1a" }}
      >
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5" style={{ color: "var(--accent-blue)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {textViewerAttachment.filename}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const blob = new Blob([textViewerAttachment.content], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = textViewerAttachment.filename;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="px-3 py-1.5 rounded-lg text-sm transition-colors hover:bg-white/10"
            style={{ color: "var(--text-secondary)" }}
          >
            Download
          </button>
          <button
            onClick={() => setTextViewerAttachment(null)}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
            style={{ color: "var(--text-muted)" }}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-8">
        <pre
          className="text-sm leading-relaxed whitespace-pre-wrap"
          style={{
            fontFamily: "var(--font-mono, 'SF Mono', Menlo, monospace)",
            color: "var(--text-primary)",
            backgroundColor: "var(--bg-card)",
            padding: "24px",
            borderRadius: "12px",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {textViewerAttachment.content}
        </pre>
      </div>
    </div>
  );

  return createPortal(
    <>
      {modal}
      {lightbox}
      {textViewer}
      {docViewer}
      {quoteModal}
    </>,
    document.body
  );
}
