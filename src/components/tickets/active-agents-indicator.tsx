"use client";

interface ActiveAgent {
  id: string;
  name: string;
  role: string;
  color: string;
  status: string; // What they're currently working on
}

interface ActiveAgentsIndicatorProps {
  agents: ActiveAgent[];
}

export function ActiveAgentsIndicator({ agents }: ActiveAgentsIndicatorProps) {
  if (agents.length === 0) return null;

  return (
    <div
      className="sticky top-0 z-10 p-3 mb-4 backdrop-blur-md border-b"
      style={{
        backgroundColor: "var(--bg-elevated-alpha)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            {agents.length} {agents.length === 1 ? "sim" : "sims"} working
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-start gap-3 p-3 rounded-lg"
            style={{
              backgroundColor: "var(--bg-input)",
              borderLeft: `3px solid ${agent.color}`,
            }}
          >
            {/* Agent Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ backgroundColor: agent.color }}
            >
              {agent.name.charAt(0)}
            </div>

            {/* Agent Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {agent.name}
                </span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${agent.color}15`,
                    color: agent.color,
                  }}
                >
                  {agent.role}
                </span>
              </div>
              <p
                className="text-xs leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {agent.status}
              </p>
            </div>

            {/* Typing indicator */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <div
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{
                  backgroundColor: agent.color,
                  animationDelay: "0ms",
                }}
              />
              <div
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{
                  backgroundColor: agent.color,
                  animationDelay: "150ms",
                }}
              />
              <div
                className="w-1.5 h-1.5 rounded-full animate-bounce"
                style={{
                  backgroundColor: agent.color,
                  animationDelay: "300ms",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
