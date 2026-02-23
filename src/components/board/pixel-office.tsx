"use client";

import { useRef, useEffect, useState, useCallback } from "react";

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

// ---------------------------------------------------------------------------
// Workstation constants — positions as percentages of the background image
// ---------------------------------------------------------------------------

interface Workstation {
  id: string;
  label: string;
  roles: string[];
  x: number; // 0-1 percentage from left
  y: number; // 0-1 percentage from top
}

export const WORKSTATIONS: Workstation[] = [
  { id: "researcher-desk", label: "Research", roles: ["researcher"], x: 0.15, y: 0.55 },
  { id: "developer-desk", label: "Dev", roles: ["developer", "lead"], x: 0.45, y: 0.55 },
  { id: "design-whiteboard", label: "Design", roles: ["designer"], x: 0.75, y: 0.45 },
  { id: "coffee-cooler", label: "Break", roles: [], x: 0.88, y: 0.70 },
];

// Background image intrinsic aspect ratio (fallback until image loads)
const BG_ASPECT = 16 / 5; // wide office panorama
const MAX_HEIGHT = 180;
const AVATAR_RADIUS_RATIO = 0.06; // avatar circle radius as fraction of canvas width

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PixelOffice({ personaStates }: PixelOfficeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const avatarImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [bgLoaded, setBgLoaded] = useState(false);
  const [bgFailed, setBgFailed] = useState(false);
  const rafRef = useRef<number>(0);
  const dirtyRef = useRef(true);

  // Load background image
  useEffect(() => {
    const img = new Image();
    img.src = "/office/office-bg.png";
    img.onload = () => {
      bgImageRef.current = img;
      setBgLoaded(true);
      dirtyRef.current = true;
    };
    img.onerror = () => {
      setBgFailed(true);
      dirtyRef.current = true;
    };
  }, []);

  // Pre-load persona avatar images (they're base64 data URLs, no CORS issues)
  useEffect(() => {
    const current = avatarImagesRef.current;
    for (const p of personaStates) {
      if (p.avatar && !current.has(p.personaId)) {
        const img = new Image();
        img.src = p.avatar;
        img.onload = () => { dirtyRef.current = true; };
        current.set(p.personaId, img);
      }
    }
  }, [personaStates]);

  // Mark dirty when persona states change
  useEffect(() => {
    dirtyRef.current = true;
  }, [personaStates]);

  // Assign personas to workstations
  const getWorkstationForPersona = useCallback((role?: string): Workstation => {
    if (role) {
      const match = WORKSTATIONS.find((w) => w.roles.includes(role));
      if (match) return match;
    }
    // Default: coffee cooler
    return WORKSTATIONS[WORKSTATIONS.length - 1];
  }, []);

  // Main draw function
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = width * dpr;
      const h = height * dpr;

      ctx.clearRect(0, 0, w, h);

      // Draw background
      if (bgLoaded && bgImageRef.current) {
        ctx.drawImage(bgImageRef.current, 0, 0, w, h);
      } else {
        // Fallback: dark office floor with pixel grid
        ctx.fillStyle = "#1a1f2e";
        ctx.fillRect(0, 0, w, h);

        // Subtle grid lines
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = dpr;
        const gridSize = 24 * dpr;
        for (let x = 0; x < w; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = 0; y < h; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }

        // Draw simple desk shapes at workstation positions
        for (const ws of WORKSTATIONS) {
          const cx = ws.x * w;
          const cy = ws.y * h;
          const deskW = 60 * dpr;
          const deskH = 30 * dpr;
          ctx.fillStyle = "rgba(80, 70, 60, 0.6)";
          ctx.fillRect(cx - deskW / 2, cy + 10 * dpr, deskW, deskH);
          // Label
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.font = `${10 * dpr}px monospace`;
          ctx.textAlign = "center";
          ctx.fillText(ws.label, cx, cy + 55 * dpr);
        }
      }

      // Draw personas at their workstations
      const avatarR = AVATAR_RADIUS_RATIO * w;
      // Group personas by workstation to handle stacking
      const wsGroups = new Map<string, PersonaActivityState[]>();
      for (const p of personaStates) {
        const ws = getWorkstationForPersona(p.role);
        const group = wsGroups.get(ws.id) || [];
        group.push(p);
        wsGroups.set(ws.id, group);
      }

      for (const [wsId, personas] of wsGroups) {
        const ws = WORKSTATIONS.find((s) => s.id === wsId);
        if (!ws) continue;

        personas.forEach((p, i) => {
          const offsetX = (i - (personas.length - 1) / 2) * avatarR * 2.2;
          const cx = ws.x * w + offsetX;
          const cy = ws.y * h;

          // Activity indicator ring
          if (p.isActive) {
            // Pulsing green ring for active personas
            ctx.beginPath();
            ctx.arc(cx, cy, avatarR + 3 * dpr, 0, Math.PI * 2);
            ctx.strokeStyle = "#22c55e";
            ctx.lineWidth = 3 * dpr;
            ctx.stroke();
          } else if (p.isAwake) {
            // Subtle ring for awake but idle
            ctx.beginPath();
            ctx.arc(cx, cy, avatarR + 2 * dpr, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(91, 141, 249, 0.5)";
            ctx.lineWidth = 2 * dpr;
            ctx.stroke();
          }

          // Avatar circle (clip + draw)
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, avatarR, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();

          const avatarImg = avatarImagesRef.current.get(p.personaId);
          if (avatarImg && avatarImg.complete && avatarImg.naturalWidth > 0) {
            ctx.drawImage(
              avatarImg,
              cx - avatarR,
              cy - avatarR,
              avatarR * 2,
              avatarR * 2
            );
          } else {
            // Color fallback with initial
            ctx.fillStyle = p.color;
            ctx.fillRect(cx - avatarR, cy - avatarR, avatarR * 2, avatarR * 2);
            ctx.fillStyle = "#fff";
            ctx.font = `bold ${avatarR}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(p.name[0], cx, cy);
          }
          ctx.restore();

          // Dim sleeping personas
          if (!p.isAwake) {
            ctx.beginPath();
            ctx.arc(cx, cy, avatarR, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.fill();
          }

          // Name label
          ctx.fillStyle = p.isAwake ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)";
          ctx.font = `${9 * dpr}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(p.name.split(" ")[0], cx, cy + avatarR + 4 * dpr);
        });
      }
    },
    [bgLoaded, personaStates, getWorkstationForPersona]
  );

  // Resize handler + render loop
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      const rect = container!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const aspect = bgImageRef.current
        ? bgImageRef.current.naturalWidth / bgImageRef.current.naturalHeight
        : BG_ASPECT;

      let displayW = rect.width;
      let displayH = displayW / aspect;
      if (displayH > MAX_HEIGHT) {
        displayH = MAX_HEIGHT;
        displayW = displayH * aspect;
      }

      canvas!.style.width = `${displayW}px`;
      canvas!.style.height = `${displayH}px`;
      canvas!.width = displayW * dpr;
      canvas!.height = displayH * dpr;

      dirtyRef.current = true;
    }

    function frame() {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        const dpr = window.devicePixelRatio || 1;
        const displayW = canvas!.width / dpr;
        const displayH = canvas!.height / dpr;
        draw(ctx!, displayW, displayH);
      }
      rafRef.current = requestAnimationFrame(frame);
    }

    resize();
    rafRef.current = requestAnimationFrame(frame);

    const observer = new ResizeObserver(() => {
      resize();
    });
    observer.observe(container);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="w-full flex items-center justify-center overflow-hidden"
      style={{ maxHeight: MAX_HEIGHT }}
    >
      <canvas
        ref={canvasRef}
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}
