"use client";

import { createContext, useContext, useSyncExternalStore, useCallback } from "react";
import { getTranslations, type Locale, type Translations } from "./translations";

const STORAGE_KEY = "bonsai-locale";
const DEFAULT_LOCALE: Locale = "en";

// Subscribers for useSyncExternalStore
let listeners: (() => void)[] = [];
function subscribe(cb: () => void) {
  listeners = [...listeners, cb];
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}
function emitChange() {
  for (const l of listeners) l();
}

function getSnapshot(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  return (localStorage.getItem(STORAGE_KEY) as Locale) || DEFAULT_LOCALE;
}

function getServerSnapshot(): Locale {
  return DEFAULT_LOCALE;
}

// Cross-tab sync: listen for storage changes from other tabs
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) emitChange();
  });
}

interface LanguageContextValue {
  locale: Locale;
  t: Translations;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const t = getTranslations(locale);

  const setLocale = useCallback((newLocale: Locale) => {
    localStorage.setItem(STORAGE_KEY, newLocale);
    emitChange();
    // Persist to server for agent dispatch
    fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "user_language", value: newLocale }),
    }).catch(() => {});
  }, []);

  return (
    <LanguageContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    // Fallback for components outside provider
    return {
      locale: DEFAULT_LOCALE as Locale,
      t: getTranslations(DEFAULT_LOCALE),
      setLocale: () => {},
    };
  }
  return ctx;
}
