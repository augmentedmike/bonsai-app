"use client";

import type { DroppedPath } from "@/lib/drop-paths";
import { truncatePath } from "@/lib/drop-paths";

interface DroppedPathBadgesProps {
  paths: DroppedPath[];
  onRemove: (id: string) => void;
}

export function DroppedPathBadges({ paths, onRemove }: DroppedPathBadgesProps) {
  if (paths.length === 0) return null;
  return (
    <div className="flex gap-2 mt-2 flex-wrap">
      {paths.map((dp) => (
        <div
          key={dp.id}
          className="relative group flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border-medium)] bg-[var(--bg-input)]"
          title={dp.path}
        >
          {/* Folder / file icon */}
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            style={{ color: "var(--text-muted)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
            />
          </svg>
          <span
            className="text-xs truncate max-w-[200px]"
            style={{ color: "var(--text-secondary)" }}
          >
            {truncatePath(dp.path)}
          </span>
          <button
            onClick={() => onRemove(dp.id)}
            className="w-4 h-4 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          >
            <svg
              className="w-2.5 h-2.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
