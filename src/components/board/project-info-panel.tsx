import type { ReactNode } from "react";
import type { Project, Persona } from "@/types";

interface ProjectInfoPanelProps {
  project: Project;
  personas: Persona[];
  ticketStats: { planning: number; building: number; shipped: number };
  awakePersonaIds?: Set<string>;
  onPersonaClick?: (personaId: string) => void;
  onChatOpen?: () => void;
  hideOnHold?: boolean;
  onHideOnHoldChange?: (value: boolean) => void;
  holdCount?: number;
  actionsSlot?: ReactNode;
}

export function ProjectInfoPanel({ project, personas, ticketStats, awakePersonaIds = new Set(), onPersonaClick, onChatOpen, hideOnHold, onHideOnHoldChange, holdCount = 0, actionsSlot }: ProjectInfoPanelProps) {
  const total = ticketStats.planning + ticketStats.building + ticketStats.shipped;

  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
        {project.description || ""}
      </span>

      <div className="flex items-center gap-3 ml-auto flex-shrink-0">
        <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span>{total} tickets</span>
          <span>{ticketStats.shipped} done</span>
        </div>
        {holdCount > 0 && onHideOnHoldChange && (
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Hide on-hold tickets from the board">
            <input
              type="checkbox"
              checked={hideOnHold ?? false}
              onChange={(e) => onHideOnHoldChange(e.target.checked)}
              className="accent-amber-400 w-3 h-3 cursor-pointer"
            />
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Hide held ({holdCount})
            </span>
          </label>
        )}
        <div className="flex items-center gap-1.5">
          {[...personas].sort((a, b) => {
            const aAwake = awakePersonaIds.has(a.id) ? 0 : 1;
            const bAwake = awakePersonaIds.has(b.id) ? 0 : 1;
            return aAwake - bAwake;
          }).map((p) => {
            const isAwake = awakePersonaIds.has(p.id);
            return (
              <div
                key={p.id}
                className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 transition-all"
                style={{
                  opacity: isAwake ? 1 : 0.4,
                  cursor: onPersonaClick ? "pointer" : "default",
                }}
                title={`${p.name} — ${isAwake ? "awake" : "asleep"}`}
                onClick={() => onPersonaClick?.(p.id)}
                onMouseEnter={(e) => {
                  if (onPersonaClick) (e.currentTarget as HTMLElement).style.transform = "scale(1.15)";
                }}
                onMouseLeave={(e) => {
                  if (onPersonaClick) (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                }}
              >
                {p.avatar ? (
                  <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name[0]}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {actionsSlot && (
          <>
            <div className="w-px h-5 flex-shrink-0" style={{ backgroundColor: "var(--border-medium)" }} />
            <div className="flex items-center gap-2 flex-shrink-0">
              {actionsSlot}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
