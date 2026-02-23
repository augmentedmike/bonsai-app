"use client";

import { useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonaActivityState {
  personaId: string;
  name: string;
  color: string;
  avatar?: string;
  role?: string;
  isAwake: boolean;
  isActive: boolean;
}

export interface PixelOfficeProps {
  personaStates: PersonaActivityState[];
}

// Map role slug → workstation key
function getWorkstation(role: string | undefined, isActive: boolean): string {
  if (!isActive) return "coffee";
  switch (role) {
    case "researcher":
      return "research";
    case "developer":
      return "dev";
    case "designer":
      return "design";
    default:
      return "coffee";
  }
}

// Workstation positions (percentage-based for responsive layout)
const STATIONS: Record<string, { x: number; y: number; label: string }> = {
  research: { x: 14, y: 32, label: "Research" },
  dev: { x: 72, y: 32, label: "Dev" },
  design: { x: 86, y: 32, label: "Design" },
  coffee: { x: 44, y: 38, label: "Break" },
};

// Offset characters at the same station so they don't overlap
function getCharacterPosition(
  station: string,
  indexAtStation: number,
  totalAtStation: number
): { x: number; y: number } {
  const base = STATIONS[station] ?? STATIONS.coffee;
  // Fan out horizontally, centered on the station
  const spread = 5; // percentage units between characters
  const offsetX = (indexAtStation - (totalAtStation - 1) / 2) * spread;
  return { x: base.x + offsetX, y: base.y };
}

// Furniture SVG icons (simple pixel-art style)
function ResearchDesk() {
  return (
    <svg width="52" height="40" viewBox="0 0 52 40" fill="none">
      {/* Desk */}
      <rect x="4" y="20" width="44" height="4" rx="1" fill="#3a3526" />
      <rect x="8" y="24" width="4" height="14" fill="#2d2a1f" />
      <rect x="40" y="24" width="4" height="14" fill="#2d2a1f" />
      {/* Books */}
      <rect x="10" y="10" width="6" height="10" rx="1" fill="#8b5cf6" opacity="0.7" />
      <rect x="17" y="12" width="5" height="8" rx="1" fill="#a78bfa" opacity="0.6" />
      <rect x="23" y="8" width="6" height="12" rx="1" fill="#7c3aed" opacity="0.5" />
      {/* Magnifying glass */}
      <circle cx="38" cy="14" r="4" stroke="#8b8fa3" strokeWidth="1.5" fill="none" opacity="0.5" />
      <line x1="41" y1="17" x2="44" y2="20" stroke="#8b8fa3" strokeWidth="1.5" opacity="0.5" />
    </svg>
  );
}

function DevStation() {
  return (
    <svg width="56" height="40" viewBox="0 0 56 40" fill="none">
      {/* Desk */}
      <rect x="2" y="22" width="52" height="4" rx="1" fill="#3a3526" />
      <rect x="6" y="26" width="4" height="12" fill="#2d2a1f" />
      <rect x="46" y="26" width="4" height="12" fill="#2d2a1f" />
      {/* Monitor 1 */}
      <rect x="8" y="6" width="16" height="12" rx="1" fill="#1a1d27" stroke="#3b82f6" strokeWidth="0.75" opacity="0.8" />
      <rect x="14" y="18" width="4" height="4" fill="#2d2a1f" />
      {/* Screen glow */}
      <rect x="10" y="8" width="12" height="8" rx="0.5" fill="#3b82f6" opacity="0.15" />
      <rect x="11" y="9" width="8" height="1" fill="#3b82f6" opacity="0.3" />
      <rect x="11" y="11" width="10" height="1" fill="#3b82f6" opacity="0.2" />
      <rect x="11" y="13" width="6" height="1" fill="#3b82f6" opacity="0.25" />
      {/* Monitor 2 */}
      <rect x="30" y="6" width="16" height="12" rx="1" fill="#1a1d27" stroke="#3b82f6" strokeWidth="0.75" opacity="0.8" />
      <rect x="36" y="18" width="4" height="4" fill="#2d2a1f" />
      {/* Screen glow */}
      <rect x="32" y="8" width="12" height="8" rx="0.5" fill="#3b82f6" opacity="0.15" />
      <rect x="33" y="9" width="5" height="1" fill="#34d399" opacity="0.3" />
      <rect x="33" y="11" width="9" height="1" fill="#3b82f6" opacity="0.2" />
      <rect x="33" y="13" width="7" height="1" fill="#f87171" opacity="0.2" />
    </svg>
  );
}

function DesignStation() {
  return (
    <svg width="44" height="40" viewBox="0 0 44 40" fill="none">
      {/* Desk */}
      <rect x="2" y="22" width="40" height="4" rx="1" fill="#3a3526" />
      <rect x="6" y="26" width="4" height="12" fill="#2d2a1f" />
      <rect x="34" y="26" width="4" height="12" fill="#2d2a1f" />
      {/* Tablet/canvas */}
      <rect x="8" y="8" width="18" height="14" rx="1" fill="#1a1d27" stroke="#f59e0b" strokeWidth="0.75" opacity="0.8" />
      <rect x="10" y="10" width="14" height="10" rx="0.5" fill="#f59e0b" opacity="0.1" />
      {/* Color swatches */}
      <circle cx="32" cy="12" r="2.5" fill="#f59e0b" opacity="0.6" />
      <circle cx="32" cy="18" r="2.5" fill="#f472b6" opacity="0.6" />
      <circle cx="37" cy="15" r="2.5" fill="#34d399" opacity="0.6" />
    </svg>
  );
}

function CoffeeCooler() {
  return (
    <svg width="36" height="44" viewBox="0 0 36 44" fill="none">
      {/* Water cooler body */}
      <rect x="10" y="8" width="16" height="24" rx="2" fill="#1e2230" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      {/* Water bottle */}
      <rect x="13" y="2" width="10" height="8" rx="1.5" fill="#3b82f6" opacity="0.2" />
      <rect x="15" y="0" width="6" height="3" rx="1" fill="#3b82f6" opacity="0.15" />
      {/* Spout */}
      <rect x="22" y="20" width="6" height="2" rx="0.5" fill="#5c6070" />
      {/* Base */}
      <rect x="8" y="32" width="20" height="10" rx="1" fill="#181b24" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      {/* Cup */}
      <rect x="24" y="24" width="6" height="6" rx="1" fill="#2d2a1f" opacity="0.6" />
    </svg>
  );
}

function CharacterSprite({
  persona,
  isActive,
  isAwake,
}: {
  persona: PersonaActivityState;
  isActive: boolean;
  isAwake: boolean;
}) {
  const initial = persona.name[0]?.toUpperCase() ?? "?";
  return (
    <div
      className="flex flex-col items-center"
      style={{ width: 44, opacity: isAwake ? 1 : 0.5 }}
    >
      {/* Character body + head */}
      <div className="relative">
        {/* Activity indicator ring */}
        <div
          className="w-8 h-8 rounded-full overflow-hidden border-2 flex-shrink-0"
          style={{
            borderColor: isActive ? persona.color : isAwake ? "rgba(91,141,249,0.5)" : "rgba(255,255,255,0.1)",
            boxShadow: isActive
              ? `0 0 8px ${persona.color}40`
              : "none",
          }}
        >
          {persona.avatar ? (
            <img
              src={persona.avatar}
              alt={persona.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: persona.color }}
            >
              {initial}
            </div>
          )}
        </div>
        {/* Small pixel body below head */}
        <div
          className="mx-auto -mt-0.5"
          style={{
            width: 12,
            height: 10,
            backgroundColor: persona.color,
            opacity: 0.5,
            borderRadius: "0 0 3px 3px",
          }}
        />
      </div>
      {/* Name label */}
      <span
        className="text-[9px] mt-0.5 truncate text-center block"
        style={{
          color: persona.color,
          maxWidth: 44,
          opacity: 0.8,
        }}
      >
        {persona.name.split(" ")[0]}
      </span>
    </div>
  );
}

export function PixelOffice({ personaStates }: PixelOfficeProps) {
  // Assign each persona to a workstation
  const assignments = useMemo(() => {
    const stationGroups: Record<string, PersonaActivityState[]> = {};
    for (const p of personaStates) {
      const station = getWorkstation(p.role, p.isActive);
      if (!stationGroups[station]) stationGroups[station] = [];
      stationGroups[station].push(p);
    }

    return personaStates.map((p) => {
      const station = getWorkstation(p.role, p.isActive);
      const group = stationGroups[station];
      const indexAtStation = group.indexOf(p);
      const pos = getCharacterPosition(station, indexAtStation, group.length);
      return { persona: p, station, pos };
    });
  }, [personaStates]);

  if (personaStates.length === 0) return null;

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{
        height: 120,
        background: `linear-gradient(180deg, var(--bg-secondary) 0%, var(--bg-primary) 100%)`,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      {/* Subtle floor grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Furniture: Research Desk */}
      <div
        className="absolute"
        style={{
          left: `${STATIONS.research.x}%`,
          top: "8px",
          transform: "translateX(-50%)",
        }}
      >
        <ResearchDesk />
        <div
          className="text-[8px] text-center mt-0"
          style={{ color: "var(--text-muted)", opacity: 0.5 }}
        >
          Research
        </div>
      </div>

      {/* Furniture: Coffee Cooler */}
      <div
        className="absolute"
        style={{
          left: `${STATIONS.coffee.x}%`,
          top: "4px",
          transform: "translateX(-50%)",
        }}
      >
        <CoffeeCooler />
        <div
          className="text-[8px] text-center -mt-1"
          style={{ color: "var(--text-muted)", opacity: 0.5 }}
        >
          Break room
        </div>
      </div>

      {/* Furniture: Dev Station */}
      <div
        className="absolute"
        style={{
          left: `${STATIONS.dev.x}%`,
          top: "8px",
          transform: "translateX(-50%)",
        }}
      >
        <DevStation />
        <div
          className="text-[8px] text-center mt-0"
          style={{ color: "var(--text-muted)", opacity: 0.5 }}
        >
          Dev
        </div>
      </div>

      {/* Furniture: Design Station */}
      <div
        className="absolute"
        style={{
          left: `${STATIONS.design.x}%`,
          top: "8px",
          transform: "translateX(-50%)",
        }}
      >
        <DesignStation />
        <div
          className="text-[8px] text-center mt-0"
          style={{ color: "var(--text-muted)", opacity: 0.5 }}
        >
          Design
        </div>
      </div>

      {/* Characters */}
      {assignments.map(({ persona, pos }) => (
        <div
          key={persona.personaId}
          className="absolute"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: "translateX(-50%)",
            transition: "left 1.2s ease-in-out, top 1.2s ease-in-out",
            animation: persona.isActive
              ? "pixel-office-working 2s ease-in-out infinite"
              : "pixel-office-idle 3s ease-in-out infinite",
            zIndex: 10,
          }}
        >
          <CharacterSprite persona={persona} isActive={persona.isActive} isAwake={persona.isAwake} />
        </div>
      ))}

      {/* CSS Keyframes */}
      <style>{`
        @keyframes pixel-office-working {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(-2px); }
        }
        @keyframes pixel-office-idle {
          0%, 100% { transform: translateX(-50%) translateY(0); }
          50% { transform: translateX(-50%) translateY(1px); }
        }
      `}</style>
    </div>
  );
}
