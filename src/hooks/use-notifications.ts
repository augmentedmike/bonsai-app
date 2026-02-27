"use client";

import { useState, useRef, useCallback, useEffect } from "react";

function playBlip() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1047, ctx.currentTime); // C6
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08); // A5
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
    ctx.close();
  } catch {
    // Audio not available — silently skip
  }
}

export function useNotifications(pollMs = 5000) {
  const [unread, setUnread] = useState(0);
  const prevLatestIdRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (!res.ok) return;
      const data: { unread: number; latestId: number | null } = await res.json();
      setUnread(data.unread);

      // Play blip only after first load (avoid blip on page load)
      if (initializedRef.current && data.latestId !== null && data.latestId !== prevLatestIdRef.current && data.unread > 0) {
        playBlip();
      }

      if (!initializedRef.current) initializedRef.current = true;
      prevLatestIdRef.current = data.latestId;
    } catch {
      // Swallow fetch errors
    }
  }, []);

  const markRead = useCallback(async () => {
    if (unread === 0) return;
    try {
      await fetch("/api/notifications", { method: "POST", credentials: "include" });
      setUnread(0);
    } catch {
      // Swallow
    }
  }, [unread]);

  useEffect(() => {
    fetchUnread();
    const id = setInterval(fetchUnread, pollMs);
    return () => clearInterval(id);
  }, [fetchUnread, pollMs]);

  return { unread, markRead };
}
