"use client";

import { useState, useRef, useEffect } from "react";

export interface FilterOption<T extends string> {
  key: T;
  label: string;
  count: number;
}

interface FilterDropdownProps<T extends string> {
  label: string;
  options: FilterOption<T>[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
}

export function FilterDropdown<T extends string>({
  label,
  options,
  selected,
  onChange,
}: FilterDropdownProps<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isAll = selected.size === 0;

  // Button label summary
  const summary = isAll
    ? "all"
    : selected.size === 1
    ? options.find((o) => selected.has(o.key))?.label ?? "1"
    : `${selected.size} selected`;

  function toggleOption(key: T) {
    const next = new Set(selected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    onChange(next);
  }

  function selectAll() {
    onChange(new Set());
  }

  const hasActive = !isAll;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all select-none"
        style={{
          backgroundColor: hasActive ? "rgba(91,141,249,0.18)" : "var(--bg-card)",
          color: hasActive ? "var(--accent-blue)" : "var(--text-secondary)",
          border: `1px solid ${hasActive ? "rgba(91,141,249,0.4)" : "var(--border-medium)"}`,
        }}
      >
        <span style={{ color: "var(--text-muted)", marginRight: 1 }}>{label}</span>
        <span style={{ color: hasActive ? "var(--accent-blue)" : "var(--text-secondary)" }}>
          ({summary})
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ opacity: 0.5, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-lg overflow-hidden"
          style={{
            top: "100%",
            left: 0,
            minWidth: 160,
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-medium)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {/* All / reset */}
          <button
            onClick={selectAll}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-all hover:opacity-80"
            style={{
              backgroundColor: isAll ? "rgba(91,141,249,0.15)" : "transparent",
              color: isAll ? "var(--accent-blue)" : "var(--text-secondary)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span>All</span>
            {isAll && (
              <span
                className="rounded-full px-1.5 tabular-nums"
                style={{ backgroundColor: "rgba(91,141,249,0.2)", color: "var(--accent-blue)", fontSize: 10 }}
              >
                {options.reduce((s, o) => s + o.count, 0)}
              </span>
            )}
          </button>

          {/* Individual options */}
          {options.map((opt) => {
            const active = selected.has(opt.key);
            return (
              <button
                key={opt.key}
                onClick={() => toggleOption(opt.key)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs transition-all hover:opacity-80"
                style={{
                  backgroundColor: active ? "rgba(91,141,249,0.1)" : "transparent",
                  color: active ? "var(--accent-blue)" : "var(--text-secondary)",
                }}
              >
                <div className="flex items-center gap-2">
                  {/* Checkbox indicator */}
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      border: `1.5px solid ${active ? "var(--accent-blue)" : "var(--border-medium)"}`,
                      backgroundColor: active ? "var(--accent-blue)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {active && (
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M1.5 4L3.5 6L6.5 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span>{opt.label}</span>
                </div>
                <span
                  className="rounded-full px-1.5 tabular-nums"
                  style={{
                    backgroundColor: active ? "rgba(91,141,249,0.2)" : "var(--bg-secondary)",
                    color: active ? "var(--accent-blue)" : "var(--text-muted)",
                    fontSize: 10,
                  }}
                >
                  {opt.count}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
