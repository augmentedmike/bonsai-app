"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { SettingsPanel } from "./settings-panel";
import type { AgentRun } from "@/types";
import { useLanguage } from "@/i18n/language-context";
import { useUser } from "@/contexts/user-context";

function NavIcon({ icon, active }: { icon: string; active?: boolean }) {
  const base = active
    ? "text-[var(--accent-blue)]"
    : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]";

  switch (icon) {
    case "projects":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          {/* Stacked folders */}
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v8.25m19.5 0v.75A2.25 2.25 0 0119.5 17.25h-15a2.25 2.25 0 01-2.25-2.25V7.5" />
        </svg>
      );
    case "ideas":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
      );
    case "board":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      );
    case "activity":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12 19.5h.01" />
        </svg>
      );
    case "team":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      );
    case "settings":
      return (
        <svg className={`w-5 h-5 ${base}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}

// Extract active project slug from pathname like /p/my-project/board
function getSlugFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/p\/([^/]+)/);
  return match ? match[1] : undefined;
}

// Extract the sub-page from pathname like /p/my-project/board → "board"
function getSubPage(pathname: string): string | undefined {
  const match = pathname.match(/^\/p\/[^/]+\/(.+)$/);
  return match ? match[1] : undefined;
}

export function Sidebar({ userName }: { userName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const { user } = useUser();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeRunCount, setActiveRunCount] = useState(0);

  // Listen for open-settings events dispatched from other components (e.g. projects dashboard footer)
  useEffect(() => {
    function onOpenSettings(e: Event) {
      const detail = (e as CustomEvent<{ section?: string }>).detail;
      setSettingsInitialSection(detail?.section);
      setSettingsOpen(true);
    }
    window.addEventListener("open-settings", onOpenSettings);
    return () => window.removeEventListener("open-settings", onOpenSettings);
  }, []);

  const activeSlug = getSlugFromPath(pathname);
  const subPage = getSubPage(pathname);

  // Background poll for active agent count
  useEffect(() => {
    let cancelled = false;
    async function fetchCount() {
      try {
        const res = await fetch("/api/agent-runs?limit=10");
        if (!cancelled) {
          const data = await res.json();
          const count = Array.isArray(data)
            ? data.filter((r: AgentRun) => r.status === "running").length
            : 0;
          setActiveRunCount(count);
        }
      } catch {}
    }
    fetchCount();
    const interval = setInterval(fetchCount, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);



  const displayName = user?.name || userName || "User";

  function navTo(subPath: string) {
    if (activeSlug) {
      router.push(`/p/${activeSlug}/${subPath}`);
    }
  }

  // Nav items that require an active project
  const projectNavItems = [
    { icon: "board", label: t.nav.board, subPath: "board", match: (s: string | undefined) => s === "board" || s === undefined },
    { icon: "activity", label: t.nav.activity, subPath: "activity", match: (s: string | undefined) => s === "activity" },
    { icon: "settings", label: t.nav.settings, subPath: "settings", match: (s: string | undefined) => s === "settings" },
  ];

  return (
    <aside
      className="relative flex flex-col items-center w-16 py-4 border-r"
      style={{
        backgroundColor: "var(--bg-sidebar)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {/* Nav list — logo, global items, project items, then avatar at bottom */}
      <div className="flex flex-col items-center gap-1 w-full">
        {/* Logo — always links to "/" */}
        <Link href="/" className="flex flex-col items-center mb-4 cursor-pointer">
          <div className="w-9 h-9 rounded-xl overflow-hidden">
            <Image src="/bonsai-os-logo-l.png" alt="Bonsai" width={36} height={36} className="w-full h-full object-cover" />
          </div>
          <span className="text-[9px] font-semibold mt-1 tracking-wide uppercase">
            <span style={{ color: "var(--text-primary)" }}>BONS</span>
            <span style={{ color: "var(--accent-pink)" }}>AI</span>
          </span>
        </Link>

        {/* Projects — links to / */}
        <Link
          href="/"
          title="Projects"
          className="group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          style={pathname === "/" ? { backgroundColor: "rgba(91, 141, 249, 0.1)" } : undefined}
        >
          <NavIcon icon="projects" active={pathname === "/"} />
        </Link>

        {/* Global activity — always visible */}
        <Link
          href="/activity"
          title="All Activity"
          className="group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          style={pathname === "/activity" ? { backgroundColor: "rgba(91, 141, 249, 0.1)" } : undefined}
        >
          <NavIcon icon="activity" active={pathname === "/activity"} />
          {activeRunCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white px-1"
              style={{ backgroundColor: "#22c55e" }}
            >
              {activeRunCount}
            </span>
          )}
        </Link>

        {/* Global team — always visible */}
        <Link
          href={activeSlug ? `/p/${activeSlug}/team` : "/workers"}
          title="Team"
          className="group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          style={(subPage === "team" || pathname === "/workers") ? { backgroundColor: "rgba(91, 141, 249, 0.1)" } : undefined}
        >
          <NavIcon icon="team" active={subPage === "team" || pathname === "/workers"} />
        </Link>

        {/* Project-scoped nav items */}
        {activeSlug && projectNavItems.map((item) => {
          const isActive = item.match(subPage);
          return (
            <button
              key={item.icon}
              onClick={() => navTo(item.subPath)}
              className="group relative w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
              style={isActive ? { backgroundColor: "rgba(91, 141, 249, 0.1)" } : undefined}
              title={item.label}
            >
              <NavIcon icon={item.icon} active={isActive} />
            </button>
          );
        })}

        {/* Avatar — bottom of nav list */}
        <div className="relative mt-2">
          <div
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-medium text-white cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: user?.avatarData ? "transparent" : "var(--accent-indigo)",
              ...(menuOpen ? { outline: "2px solid var(--accent-blue)", outlineOffset: "2px" } : {}),
            }}
            title={displayName}
          >
            {user?.avatarData ? (
              <img src={user.avatarData} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              displayName[0].toUpperCase()
            )}
          </div>

          {/* Avatar submenu: Settings + Sign out */}
          {menuOpen && (
            <div
              className="absolute top-0 left-12 z-50 rounded-lg shadow-xl overflow-hidden min-w-[140px]"
              style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-subtle)" }}
            >
              <button
                onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors flex items-center gap-2"
                style={{ color: "var(--text-primary)" }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </button>
              <div style={{ borderTop: "1px solid var(--border-subtle)" }} />
              <button
                onClick={async () => {
                  setMenuOpen(false);
                  await fetch("/api/auth/logout", { method: "POST" });
                  window.location.replace("/login");
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 transition-colors flex items-center gap-2"
                style={{ color: "#f87171" }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <SettingsPanel open={settingsOpen} onClose={() => { setSettingsOpen(false); setSettingsInitialSection(undefined); }} initialSection={settingsInitialSection} />
    </aside>
  );
}
