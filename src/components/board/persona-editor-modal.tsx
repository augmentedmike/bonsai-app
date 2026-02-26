"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Role, Persona } from "@/types";

interface PersonaEditorModalProps {
  persona: Persona | null; // null = closed, empty id = create mode
  roles: Role[];
  existingNames: string[];
  onClose: () => void;
  onSaved: () => void;
}

const ALL_TOOLS = [
  { name: "Read", group: "filesystem", description: "Read files" },
  { name: "Grep", group: "filesystem", description: "Search file contents" },
  { name: "Glob", group: "filesystem", description: "Find files by pattern" },
  { name: "Bash", group: "filesystem", description: "Run shell commands" },
  { name: "Write", group: "write", description: "Create new files" },
  { name: "Edit", group: "write", description: "Modify existing files" },
  { name: "WebSearch", group: "web", description: "Search the web" },
  { name: "WebFetch", group: "web", description: "Fetch web pages" },
  { name: "Task", group: "agent", description: "Spawn sub-Sims" },
];

function splitPersonality(p: string): [string, string] {
  const parts = p.split("\n\n");
  return [parts[0]?.trim() || "", parts.slice(1).join("\n\n").trim()];
}

function joinPersonality(app: string, comm: string): string {
  return [app.trim(), comm.trim()].filter(Boolean).join("\n\n");
}

function genderToText(g: "male" | "female" | "non-binary"): string {
  if (g === "male") return "a man";
  if (g === "female") return "a woman";
  return "a non-binary person";
}

export function PersonaEditorModal({
  persona,
  roles,
  existingNames,
  onClose,
  onSaved,
}: PersonaEditorModalProps) {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "non-binary">("male");
  const [appearance, setAppearance] = useState("");
  const [commStyle, setCommStyle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState<"" | "text" | "avatar">("");
  const [rerolling, setRerolling] = useState<"" | "name" | "appearance" | "style" | "avatar">("");
  const [saving, setSaving] = useState(false);
  const generateAbortRef = useRef<AbortController | null>(null);

  // Role permissions
  const [roleTools, setRoleTools] = useState<string[]>([]);
  const [roleToolsDirty, setRoleToolsDirty] = useState(false);
  const [savingRoleTools, setSavingRoleTools] = useState(false);

  // Art direction (loaded from DB, used for avatar generation)
  const [stylePrompt, setStylePrompt] = useState<string | null>(null);
  const [styleImage, setStyleImage] = useState<string | null>(null);

  const isCreate = persona ? !persona.id : true;
  const role = persona
    ? roles.find((r) => r.id === persona.roleId) || roles.find((r) => r.slug === persona.role)
    : null;
  const accent = role?.color || persona?.color || "#6366f1";
  const initial = name.trim() ? name.trim()[0].toUpperCase() : "?";

  function getRoleSlug(): string {
    if (role) return role.slug;
    if (persona?.role) return persona.role;
    return "developer";
  }

  function randomGender(): "male" | "female" | "non-binary" {
    const r = Math.random();
    if (r < 0.45) return "male";
    if (r < 0.9) return "female";
    return "non-binary";
  }

  // Fetch current art direction on mount (for avatar generation)
  useEffect(() => {
    if (!persona) return;
    (async () => {
      try {
        const [promptsRes, styleImageRes] = await Promise.all([
          fetch("/api/settings/prompts"),
          fetch("/api/settings/style-image"),
        ]);
        const promptsData = await promptsRes.json();
        const styleImageData = styleImageRes.ok ? await styleImageRes.json() : null;

        if (styleImageData?.image) {
          setStyleImage(styleImageData.image);
        }
        const avatarStyleEntry = promptsData.prompts?.prompt_avatar_style;
        if (avatarStyleEntry?.isDefault === false && avatarStyleEntry?.value) {
          setStylePrompt(avatarStyleEntry.value);
        }
      } catch (err) {
        console.error("Failed to fetch art direction:", err);
      }
    })();
  }, [persona]);

  // Initialize form from persona on open
  useEffect(() => {
    if (!persona) return;
    if (persona.id) {
      setName(persona.name);
      const [app, comm] = splitPersonality(persona.personality || "");
      setAppearance(app);
      setCommStyle(comm);
      setAvatarUrl(persona.avatar || null);
      setGender("male");
      if (role?.tools && role.tools.length > 0) {
        setRoleTools([...role.tools]);
      } else {
        setRoleTools(ALL_TOOLS.map((t) => t.name));
      }
      setRoleToolsDirty(false);
    } else {
      setName("");
      setAppearance("");
      setCommStyle("");
      setAvatarUrl(null);
      setRoleToolsDirty(false);
      if (role?.tools && role.tools.length > 0) {
        setRoleTools([...role.tools]);
      } else {
        setRoleTools(ALL_TOOLS.map((t) => t.name));
      }
      const g = randomGender();
      setGender(g);
      autoGenerate(getRoleSlug(), g);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona?.id, persona?.roleId]);

  // Build avatar API params respecting art direction
  function avatarParams(params: { name: string; role: string; personality: string }) {
    return {
      ...params,
      personality: styleImage
        ? `${genderToText(gender)}${params.personality ? ". " + params.personality : ""}`
        : params.personality,
      style: styleImage ? null : (stylePrompt || undefined),
      styleImage: styleImage || null,
    };
  }

  async function autoGenerate(roleSlug: string, g: "male" | "female" | "non-binary") {
    generateAbortRef.current?.abort();
    const controller = new AbortController();
    generateAbortRef.current = controller;
    const signal = controller.signal;

    setGenerating(true);
    setGeneratingPhase("text");
    try {
      const genRes = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: roleSlug, gender: g, existingNames }),
        signal,
      });
      const genData = await genRes.json();
      if (signal.aborted) return;
      if (genData.name) setName(genData.name);
      if (genData.appearance) setAppearance(genData.appearance);
      if (genData.style) setCommStyle(genData.style);

      setGeneratingPhase("avatar");
      const avatarRes = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(avatarParams({
          name: genData.name || "Worker",
          role: roleSlug,
          personality: genData.appearance || "",
        })),
        signal,
      });
      const avatarData = await avatarRes.json();
      if (signal.aborted) return;
      if (avatarData.avatar) setAvatarUrl(avatarData.avatar);
    } catch {
      if (signal.aborted) return;
    }
    setGenerating(false);
    setGeneratingPhase("");
  }

  function handleRegenerateAll() {
    const roleSlug = getRoleSlug();
    const g = randomGender();
    setGender(g);
    setName("");
    setAppearance("");
    setCommStyle("");
    setAvatarUrl(null);
    autoGenerate(roleSlug, g);
  }

  function switchGender(g: "male" | "female" | "non-binary") {
    setGender(g);
    setName("");
    setAppearance("");
    setCommStyle("");
    setAvatarUrl(null);
    autoGenerate(getRoleSlug(), g);
  }

  async function rerollName() {
    setRerolling("name");
    try {
      const res = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: getRoleSlug(), field: "name", gender, existingNames }),
      });
      const data = await res.json();
      if (data.name) setName(data.name);
    } catch {}
    setRerolling("");
  }

  async function rerollAppearance() {
    setRerolling("appearance");
    try {
      const res = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: getRoleSlug(), field: "appearance", gender }),
      });
      const data = await res.json();
      if (data.appearance) setAppearance(data.appearance);
      if (data.appearance) {
        setRerolling("avatar");
        try {
          const avatarRes = await fetch("/api/avatar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(avatarParams({
              name,
              role: getRoleSlug(),
              personality: data.appearance,
            })),
          });
          const avatarData = await avatarRes.json();
          if (avatarData.avatar) setAvatarUrl(avatarData.avatar);
        } catch {}
      }
    } catch {}
    setRerolling("");
  }

  async function rerollStyle() {
    setRerolling("style");
    try {
      const res = await fetch("/api/generate-worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: getRoleSlug(), field: "style", name: name.trim() || undefined, gender, existingNames }),
      });
      const data = await res.json();
      if (data.style) setCommStyle(data.style);
    } catch {}
    setRerolling("");
  }

  async function rerollAvatar() {
    setRerolling("avatar");
    try {
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(avatarParams({
          name,
          role: getRoleSlug(),
          personality: appearance,
        })),
      });
      const data = await res.json();
      if (data.avatar) setAvatarUrl(data.avatar);
    } catch {}
    setRerolling("");
  }

  async function handleSaveRoleTools() {
    if (!role) return;
    setSavingRoleTools(true);
    try {
      await fetch("/api/roles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: role.id, tools: roleTools }),
      });
      setRoleToolsDirty(false);
    } catch (err) {
      console.error("Failed to save role tools:", err);
    }
    setSavingRoleTools(false);
  }

  async function handleSave() {
    if (!persona || !name.trim()) return;
    setSaving(true);
    try {
      if (roleToolsDirty && role) {
        await fetch("/api/roles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: role.id, tools: roleTools }),
        });
      }

      if (isCreate) {
        await fetch("/api/personas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            roleId: role?.id || persona.roleId,
            role: role?.slug || persona.role || "developer",
            personality: joinPersonality(appearance, commStyle) || undefined,
            avatar: avatarUrl || undefined,
            skills: [],
            processes: [],
            goals: [],
            permissions: { tools: [], folders: [] },
          }),
        });
      } else {
        await fetch("/api/personas", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: persona.id,
            name: name.trim(),
            personality: joinPersonality(appearance, commStyle) || undefined,
            avatar: avatarUrl || undefined,
          }),
        });
      }
      onSaved();
    } catch {}
    setSaving(false);
  }

  useEffect(() => {
    return () => { generateAbortRef.current?.abort(); };
  }, []);

  if (!persona) return null;

  const diceIcon = (spinning: boolean) => (
    <svg className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
    </svg>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative flex flex-col"
        style={{
          width: "95vw",
          maxWidth: 1400,
          maxHeight: "92vh",
          borderRadius: 16,
          overflow: "hidden",
          border: `1px solid ${accent}20`,
          backgroundColor: "var(--bg-primary)",
          boxShadow: `0 0 60px ${accent}15, 0 25px 50px rgba(0,0,0,0.4)`,
          background: `radial-gradient(ellipse at 35% 50%, ${accent}12 0%, transparent 60%), var(--bg-primary)`,
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 24px",
            borderBottom: `1px solid ${accent}20`,
            borderTop: `3px solid ${accent}`,
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: 8, border: "none", backgroundColor: "transparent", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              {isCreate ? `New ${role?.title || persona.role}` : `Edit ${persona.name}`}
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{role?.title || persona.role}</p>
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div style={{ flex: 1, overflowY: "auto" }}>

          <div className="hire-content" style={{ padding: "24px 40px 0" }}>
            <div className="hire-main-layout" style={{ maxWidth: 1400, margin: "0 auto", display: "flex", gap: 40 }}>

              {/* ── Left Column: Character Pedestal ── */}
              <div className="hire-pedestal flex flex-col items-center" style={{ width: 340, flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 0 }}>
                  <div style={{ position: "relative" as const }}>
                  <div
                    style={{
                      width: 220,
                      height: 220,
                      borderRadius: "50%",
                      border: `3px solid ${accent}`,
                      overflow: "hidden",
                      position: "relative" as const,
                      boxShadow: `0 0 40px ${accent}40, 0 0 80px ${accent}20`,
                      backgroundColor: "var(--bg-primary)",
                    }}
                  >
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          opacity: generatingPhase === "avatar" || rerolling === "avatar" ? 0.4 : 1,
                          transition: "opacity 0.3s",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          backgroundColor: `${accent}20`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 48,
                          fontWeight: 700,
                          color: accent,
                        }}
                      >
                        {generatingPhase ? (
                          <svg className="w-12 h-12 animate-spin" style={{ color: accent }} fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : initial}
                      </div>
                    )}
                    {(generatingPhase === "avatar" || rerolling === "avatar") && avatarUrl && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg className="w-10 h-10 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </div>
                    )}
                    {avatarUrl && !generatingPhase && (
                      <button
                        onClick={rerollAvatar}
                        disabled={!!rerolling || generating}
                        title="Reroll avatar"
                        className="avatar-reroll-overlay"
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "transparent",
                          border: "none",
                          cursor: rerolling || generating ? "not-allowed" : "pointer",
                          opacity: 0,
                          transition: "opacity 0.2s",
                        }}
                      >
                        <div style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          backgroundColor: "rgba(0,0,0,0.5)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}>
                          <svg className={`w-5 h-5 ${rerolling === "avatar" ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" /></svg>
                        </div>
                      </button>
                    )}
                  </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", overflow: "hidden",
                        border: `2px solid ${accent}60`, backgroundColor: "var(--bg-primary)",
                        flexShrink: 0,
                      }}>
                        {avatarUrl && <img src={avatarUrl} alt="Small" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", opacity: generatingPhase === "avatar" || rerolling === "avatar" ? 0.4 : 1 }} />}
                      </div>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>32px</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 64, height: 64, borderRadius: "50%", overflow: "hidden",
                        border: `2px solid ${accent}60`, backgroundColor: "var(--bg-primary)",
                        flexShrink: 0,
                      }}>
                        {avatarUrl && <img src={avatarUrl} alt="Medium" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%", opacity: generatingPhase === "avatar" || rerolling === "avatar" ? 0.4 : 1 }} />}
                      </div>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>64px</span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    width: 240, height: 24, marginTop: -2,
                    background: `linear-gradient(to bottom, ${accent}25, ${accent}08)`,
                    clipPath: "polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)",
                  }}
                />
                <div
                  style={{
                    width: 260, height: 6,
                    background: `linear-gradient(to right, transparent, ${accent}30, transparent)`,
                    marginTop: -1,
                  }}
                />

                {/* Art Direction button */}
                <button
                  onClick={() => router.push(`/p/${slug}/onboard/team?artDirection=true`)}
                  title="Edit Art Direction"
                  style={{
                    marginTop: 10,
                    width: 30, height: 30, borderRadius: "50%",
                    border: `1px solid ${accent}40`, backgroundColor: `${accent}10`,
                    color: accent, display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", transition: "all 0.2s",
                    opacity: 0.7,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.backgroundColor = `${accent}25`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; e.currentTarget.style.backgroundColor = `${accent}10`; }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                  </svg>
                </button>

                <div style={{ marginTop: 10, width: 220 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Name</label>
                  <div className="flex gap-2">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Maya, Atlas, Nova..."
                      style={{ flex: 1, padding: "7px 12px", borderRadius: 6, fontSize: 13, backgroundColor: "var(--bg-input)", border: "1px solid var(--border-medium)", color: "var(--text-primary)", outline: "none" }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = accent; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-medium)"; }}
                    />
                    <button
                      onClick={rerollName}
                      disabled={!!rerolling || generating}
                      title="Reroll name"
                      style={{ width: 34, height: 34, borderRadius: 6, border: `1px solid ${accent}40`, backgroundColor: `${accent}15`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: rerolling || generating ? "not-allowed" : "pointer", opacity: rerolling || generating ? 0.4 : 1, flexShrink: 0 }}
                    >
                      {diceIcon(rerolling === "name")}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", flexDirection: "column" as const, gap: 4 }}>
                  {(["male", "female", "non-binary"] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => switchGender(g)}
                      disabled={generating || !!rerolling}
                      style={{
                        padding: "6px 0", borderRadius: 6, fontSize: 11, fontWeight: 600,
                        letterSpacing: "0.05em", textTransform: "uppercase" as const,
                        border: gender === g ? `2px solid ${accent}` : `1px solid var(--border-medium)`,
                        backgroundColor: gender === g ? `${accent}20` : "transparent",
                        color: gender === g ? accent : "var(--text-muted)",
                        cursor: generating || rerolling ? "not-allowed" : "pointer",
                        opacity: generating || rerolling ? 0.6 : 1,
                        transition: "all 0.2s", width: 160,
                      }}
                    >
                      {g === "non-binary" ? "Non-Binary" : g.charAt(0).toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Right Column: Character Traits Panel ── */}
              <div
                className="hire-traits-panel"
                style={{
                  flex: 1, border: `1px solid ${accent}30`, borderRadius: 12,
                  backgroundColor: `${accent}06`, padding: "20px 24px",
                  display: "flex", flexDirection: "column" as const, gap: 16,
                }}
              >
                <div className="hire-traits-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1.2fr", gap: 20, flex: 1, minHeight: 0 }}>
                  {/* Column 1: Role identity */}
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--text-muted)" }}>Role</label>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, color: accent, lineHeight: 1.2, marginBottom: 10 }}>
                        {role?.title || persona.role}
                      </div>
                      {role?.description && (
                        <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>{role.description}</p>
                      )}
                    </div>
                    <div style={{ marginTop: "auto" }}>
                      <button
                        onClick={handleRegenerateAll}
                        disabled={generating || !!rerolling}
                        style={{
                          padding: "6px 12px", borderRadius: 6, border: `1px solid ${accent}40`,
                          backgroundColor: `${accent}10`, color: accent, fontSize: 10, fontWeight: 700,
                          letterSpacing: "0.05em", textTransform: "uppercase" as const,
                          cursor: generating || rerolling ? "not-allowed" : "pointer",
                          opacity: generating || rerolling ? 0.4 : 1,
                          display: "flex", alignItems: "center", gap: 5, transition: "all 0.2s",
                        }}
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                        </svg>
                        {generatingPhase === "text" ? "Generating..." : generatingPhase === "avatar" ? "Painting..." : "Regen All"}
                      </button>
                    </div>
                  </div>

                  {/* Column 2: Visual Description */}
                  <div style={{ display: "flex", flexDirection: "column" as const }}>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--text-muted)", marginBottom: 6 }}>Visual Description</label>
                    <div style={{ position: "relative" as const, flex: 1, display: "flex", flexDirection: "column" as const }}>
                      <textarea
                        value={appearance}
                        onChange={(e) => setAppearance(e.target.value)}
                        placeholder="Physical features, hair, clothing..."
                        style={{ width: "100%", flex: 1, minHeight: 100, padding: "12px 14px", borderRadius: 8, fontSize: 13, backgroundColor: "var(--bg-input)", border: "1px solid var(--border-medium)", color: "var(--text-primary)", outline: "none", resize: "none" as const, lineHeight: 1.7 }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = accent; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-medium)"; }}
                      />
                      <button
                        onClick={rerollAppearance}
                        disabled={!!rerolling || generating}
                        title="Reroll appearance"
                        style={{ position: "absolute", right: 6, bottom: 6, width: 28, height: 28, borderRadius: 6, border: `1px solid ${accent}40`, backgroundColor: `${accent}15`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: rerolling || generating ? "not-allowed" : "pointer", opacity: rerolling || generating ? 0.4 : 1 }}
                      >
                        {diceIcon(rerolling === "appearance")}
                      </button>
                    </div>
                  </div>

                  {/* Column 3: Communication Style */}
                  <div style={{ display: "flex", flexDirection: "column" as const }}>
                    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "var(--text-muted)", marginBottom: 6 }}>Communication Style</label>
                    <div style={{ position: "relative" as const, flex: 1, display: "flex", flexDirection: "column" as const }}>
                      <textarea
                        value={commStyle}
                        onChange={(e) => setCommStyle(e.target.value)}
                        placeholder="Tone, energy, quirks..."
                        style={{ width: "100%", flex: 1, minHeight: 100, padding: "12px 14px", borderRadius: 8, fontSize: 13, backgroundColor: "var(--bg-input)", border: "1px solid var(--border-medium)", color: "var(--text-primary)", outline: "none", resize: "none" as const, lineHeight: 1.7 }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = accent; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-medium)"; }}
                      />
                      <button
                        onClick={rerollStyle}
                        disabled={!!rerolling || generating}
                        title="Reroll communication style"
                        style={{ position: "absolute", right: 6, bottom: 6, width: 28, height: 28, borderRadius: 6, border: `1px solid ${accent}40`, backgroundColor: `${accent}15`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", cursor: rerolling || generating ? "not-allowed" : "pointer", opacity: rerolling || generating ? 0.4 : 1 }}
                      >
                        {diceIcon(rerolling === "style")}
                      </button>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* ── Bottom: Save Button ── */}
          <div style={{ padding: "20px 40px 32px", display: "flex", justifyContent: "center" }}>
            <button
              onClick={handleSave}
              disabled={!name.trim() || saving || generating}
              style={{
                width: "100%", maxWidth: 520, padding: "16px 32px", borderRadius: 12,
                border: `2px solid ${accent}`, backgroundColor: accent, color: "#fff",
                fontSize: 16, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const,
                cursor: !name.trim() || saving || generating ? "not-allowed" : "pointer",
                opacity: !name.trim() || saving || generating ? 0.4 : 1,
                boxShadow: `0 0 20px ${accent}40, 0 0 60px ${accent}15`,
                transition: "all 0.3s",
              }}
            >
              {saving ? "Saving..." : isCreate ? `Hire ${name.trim() || role?.title || "Worker"}` : `Save ${name.trim() || "Changes"}`}
            </button>
          </div>
        </div>

        <style>{`
          .avatar-reroll-overlay:hover { opacity: 1 !important; }
          @media (max-width: 1024px) {
            .hire-content { padding: 16px 24px 0 !important; }
            .hire-main-layout { flex-direction: column !important; gap: 24px !important; }
            .hire-pedestal { width: 100% !important; flex-direction: row !important; align-items: center !important; gap: 24px; }
            .hire-traits-grid { grid-template-columns: 1fr 1fr !important; }
            .hire-traits-grid > div:first-child { grid-column: 1 / -1; flex-direction: row !important; align-items: center; gap: 20px; }
          }
          @media (max-width: 768px) {
            .hire-pedestal { flex-direction: column !important; }
            .hire-traits-grid { grid-template-columns: 1fr !important; }
            .hire-traits-grid > div:first-child { flex-direction: column !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
