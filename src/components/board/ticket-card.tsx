"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Ticket } from "@/types";
import { ticketTypes } from "@/lib/ticket-types";

interface TicketCardProps {
  ticket: Ticket;
  onDragStart?: (ticketId: number) => void;
  onDragEnd?: () => void;
  onEdit?: (ticket: Ticket) => void;
  onViewDocument?: (ticket: Ticket, docType: "research" | "implementation_plan") => void;
  onOpenEpic?: (epicId: number) => void;
}

const AGENT_ACTIVE_THRESHOLD_MS = 30 * 60 * 1000;

function isAgentActive(lastAgentActivity?: string): boolean {
  if (!lastAgentActivity) return false;
  return Date.now() - new Date(lastAgentActivity).getTime() < AGENT_ACTIVE_THRESHOLD_MS;
}

type DocStatus = "none" | "pending" | "approved";

function getDocStatus(completedAt?: string, approvedAt?: string): DocStatus {
  if (approvedAt) return "approved";
  if (completedAt) return "pending";
  return "none";
}

const docColors = {
  none:     { color: "rgba(255,255,255,0.2)", bg: "rgba(255,255,255,0.03)" },
  pending:  { color: "#fbbf24", bg: "rgba(251,191,36,0.15)" },
  approved: { color: "#4ade80", bg: "rgba(74,222,128,0.15)" },
};

export function TicketCard({ ticket, onDragStart, onDragEnd, onEdit, onViewDocument, onOpenEpic }: TicketCardProps) {
  const router = useRouter();
  const style = ticketTypes[ticket.type] ?? { label: ticket.type, color: "#6b7280", bg: "#6b7280", text: "#d1d5db" };
  const [dragging, setDragging] = useState(false);

  const researchStatus = getDocStatus(ticket.researchCompletedAt, ticket.researchApprovedAt);
  const planStatus = getDocStatus(ticket.planCompletedAt, ticket.planApprovedAt);

  const agentActive = ticket.state !== "shipped" && isAgentActive(ticket.lastAgentActivity);
  const activeRunIds = new Set(ticket.activeRunPersonaIds ?? []);
  const effectiveActiveIds = activeRunIds.size > 0
    ? activeRunIds
    : agentActive && ticket.assignee ? new Set([ticket.assignee.id]) : new Set<string>();

  // Avatar list
  const seen = new Set<string>();
  const avatars: { label: string; color?: string; imageUrl?: string; isWorking?: boolean }[] = [];
  for (const p of ticket.participants ?? []) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    avatars.push({ label: p.name, color: p.color, imageUrl: p.avatar, isWorking: effectiveActiveIds.has(p.id) });
  }
  if (seen.size === 0 && ticket.assignee) {
    avatars.push({ label: ticket.assignee.name, color: ticket.assignee.color, imageUrl: ticket.assignee.avatar, isWorking: agentActive });
  }
  const visibleAvatars = avatars.slice(0, 3);
  const overflow = avatars.length - 3;

  return (
    <div
      draggable
      onDragStart={(e) => {
        setDragging(true);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(ticket.id));
        onDragStart?.(ticket.id);
      }}
      onDragEnd={() => { setDragging(false); onDragEnd?.(); }}
      onClick={() => onEdit?.(ticket)}
      className="relative rounded-xl px-3 py-2.5 cursor-pointer active:cursor-grabbing"
      style={{
        backgroundColor: "var(--bg-card)",
        border: dragging
          ? "1px solid rgba(91,141,249,0.5)"
          : ticket.blocked
            ? "1px solid rgba(239,68,68,0.4)"
            : ticket.onHold
              ? "1px solid rgba(245,158,11,0.4)"
              : "1px solid var(--border-subtle)",
        boxShadow: dragging
          ? "0 12px 28px rgba(0,0,0,0.4), 0 0 16px rgba(91,141,249,0.1)"
          : "0 1px 2px rgba(0,0,0,0.08)",
        transform: dragging ? "scale(1.02) rotate(-1deg)" : "scale(1)",
        opacity: dragging ? 0.9 : 1,
        transition: "all 150ms cubic-bezier(0.2,0,0,1)",
      }}
    >
      {/* Top row: badges + status */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        {/* Type badge */}
        <span
          className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
          style={{
            backgroundColor: `color-mix(in srgb, ${style.bg} 18%, transparent)`,
            color: style.text,
          }}
        >
          {style.label}
        </span>

        {ticket.isEpic && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0" style={{ backgroundColor: "rgba(249,115,22,0.18)", color: "#fb923c" }}>
            Epic
          </span>
        )}
        {ticket.blocked && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0" style={{ backgroundColor: "rgba(239,68,68,0.18)", color: "#f87171" }} title={ticket.blockedReason || "Blocked"}>
            Blocked
          </span>
        )}
        {ticket.onHold && (
          <button
            onClick={async (e) => { e.stopPropagation(); await fetch(`/api/tickets/${ticket.id}/hold`, { method: "DELETE" }); router.refresh(); }}
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
            style={{ backgroundColor: "rgba(245,158,11,0.18)", color: "#fbbf24", border: "none", cursor: "pointer" }}
            title="Remove hold"
          >
            Hold
          </button>
        )}
        {ticket.state === "shipped" && ticket.mergedAt && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0" style={{ backgroundColor: "rgba(139,92,246,0.18)", color: "#a78bfa" }}>
            Merged
          </span>
        )}

        {/* Agent working indicator */}
        {agentActive && effectiveActiveIds.size > 0 && (() => {
          const p = ticket.participants?.find(x => effectiveActiveIds.has(x.id)) ?? ticket.assignee;
          if (!p) return null;
          return (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ml-auto flex-shrink-0" style={{ backgroundColor: "rgba(74,222,128,0.12)", color: "#4ade80" }}>
              <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: "#4ade80" }} />
              {p.name}
            </span>
          );
        })()}
        {!agentActive && ticket.createdAt && (
          <span className="text-[10px] ml-auto flex-shrink-0" style={{ color: "var(--text-muted)" }}>
            {ticket.createdAt.slice(0, 10)}
          </span>
        )}
      </div>

      {/* Title */}
      <p
        className="text-sm font-semibold leading-snug mb-2"
        style={{ color: "var(--text-primary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {ticket.title}
      </p>

      {/* Parent epic label */}
      {ticket.epicId && ticket.epicTitle && (
        <button
          onClick={(e) => { e.stopPropagation(); onOpenEpic?.(ticket.epicId!); }}
          className="flex items-center gap-1 mb-1.5 text-[10px] font-medium"
          style={{ color: "#fb923c", background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          ↳ {ticket.epicTitle}
        </button>
      )}

      {/* Epic progress bar */}
      {ticket.isEpic && (ticket.childCount ?? 0) > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px]" style={{ color: "#fb923c" }}>{ticket.childrenShipped}/{ticket.childCount} shipped</span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{Math.round(((ticket.childrenShipped ?? 0) / (ticket.childCount ?? 1)) * 100)}%</span>
          </div>
          <div className="w-full h-1 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(249,115,22,0.15)" }}>
            <div className="h-full rounded-full" style={{ width: `${((ticket.childrenShipped ?? 0) / (ticket.childCount ?? 1)) * 100}%`, backgroundColor: "#fb923c" }} />
          </div>
        </div>
      )}

      {/* Footer: avatars + doc status + counts */}
      <div className="flex items-center justify-between gap-2">
        {/* Avatar stack */}
        <div className="flex items-center">
          {visibleAvatars.map((av, i) => (
            <div key={i} style={{ marginLeft: i > 0 ? -6 : 0, zIndex: i + 1, position: "relative" }} title={av.isWorking ? `${av.label} working` : av.label}>
              {av.isWorking && <span className="absolute inset-0 rounded-full animate-ping" style={{ border: "1.5px solid #4ade80", opacity: 0.5 }} />}
              <div
                className="rounded-full flex items-center justify-center text-[9px] font-bold text-white overflow-hidden"
                style={{
                  width: 22, height: 22,
                  backgroundColor: av.color ?? "var(--accent-indigo)",
                  border: av.isWorking ? "1.5px solid #4ade80" : "1.5px solid var(--bg-card)",
                  position: "relative",
                }}
              >
                {av.imageUrl ? <img src={av.imageUrl} alt={av.label} className="w-full h-full object-cover" /> : av.label[0]?.toUpperCase()}
              </div>
            </div>
          ))}
          {overflow > 0 && (
            <div className="rounded-full flex items-center justify-center text-[9px] font-semibold" style={{ width: 22, height: 22, backgroundColor: "rgba(255,255,255,0.08)", border: "1.5px solid var(--bg-card)", color: "var(--text-muted)", marginLeft: -6 }}>
              +{overflow}
            </div>
          )}
          {avatars.length === 0 && (
            <div className="rounded-full flex items-center justify-center" style={{ width: 22, height: 22, border: "1.5px dashed var(--border-medium)", color: "var(--text-muted)" }}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
            </div>
          )}
        </div>

        {/* Doc status + counts */}
        <div className="flex items-center gap-1">
          {/* AC */}
          {ticket.acceptanceCriteria && (
            <span className="flex items-center h-5 px-1.5 rounded text-[9px] font-semibold" style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#a78bfa" }} title="Has acceptance criteria">AC</span>
          )}

          {/* Research */}
          {researchStatus !== "none" ? (
            <button
              onClick={(e) => { e.stopPropagation(); onViewDocument?.(ticket, "research"); }}
              className="flex items-center h-5 px-1.5 rounded text-[9px] font-semibold"
              style={{ backgroundColor: docColors[researchStatus].bg, color: docColors[researchStatus].color, border: "none", cursor: "pointer" }}
              title={`Research: ${researchStatus}`}
            >
              {researchStatus === "pending" && <span className="w-1 h-1 rounded-full animate-pulse mr-0.5" style={{ backgroundColor: docColors.pending.color }} />}
              R{researchStatus === "approved" && " ✓"}
            </button>
          ) : (
            <span className="flex items-center h-5 px-1.5 rounded text-[9px] font-semibold opacity-30" style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }} title="Research: not started">R</span>
          )}

          {/* Plan */}
          {planStatus !== "none" ? (
            <button
              onClick={(e) => { e.stopPropagation(); onViewDocument?.(ticket, "implementation_plan"); }}
              className="flex items-center h-5 px-1.5 rounded text-[9px] font-semibold"
              style={{ backgroundColor: docColors[planStatus].bg, color: docColors[planStatus].color, border: "none", cursor: "pointer" }}
              title={`Plan: ${planStatus}`}
            >
              {planStatus === "pending" && <span className="w-1 h-1 rounded-full animate-pulse mr-0.5" style={{ backgroundColor: docColors.pending.color }} />}
              P{planStatus === "approved" && " ✓"}
            </button>
          ) : (
            <span className="flex items-center h-5 px-1.5 rounded text-[9px] font-semibold opacity-30" style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }} title="Plan: not started">P</span>
          )}

          {/* Comments */}
          {ticket.commentCount > 0 && (
            <span className="flex items-center gap-0.5 h-5 px-1.5 rounded text-[9px]" style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>
              {ticket.commentCount}
            </span>
          )}

          {/* Attachments */}
          {ticket.hasAttachments && (
            <span className="flex items-center h-5 px-1.5 rounded text-[9px]" style={{ backgroundColor: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" /></svg>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
