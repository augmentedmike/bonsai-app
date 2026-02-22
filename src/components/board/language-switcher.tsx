"use client";

import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/i18n/language-context";
import type { Locale } from "@/i18n/translations";

const LANGUAGES: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
        style={{ color: "var(--text-secondary)" }}
        title={t.language.label}
      >
        {/* Globe icon */}
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
        </svg>
        <span className="uppercase">{locale}</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 py-1 rounded-lg shadow-lg border z-50 min-w-[120px]"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderColor: "var(--border-medium)",
          }}
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => {
                setLocale(lang.code);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm transition-colors hover:bg-white/5 flex items-center gap-2"
              style={{
                color: locale === lang.code ? "var(--accent-blue)" : "var(--text-secondary)",
                fontWeight: locale === lang.code ? 600 : 400,
              }}
            >
              {locale === lang.code && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
              <span className={locale === lang.code ? "" : "ml-5.5"}>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
