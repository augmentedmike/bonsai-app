import Link from "next/link";
import { getProjects } from "@/db/data/projects";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bonsai — Project Directory" };

export default async function ProjectDirectoryPage() {
  const allProjects = await getProjects();

  return (
    <div
      className="min-h-screen p-8"
      style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}
    >
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-1">Project Directory</h1>
          <p style={{ color: "var(--text-muted)" }} className="text-sm">
            {allProjects.length} project{allProjects.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {allProjects.map((p) => (
            <Link
              key={p.id}
              href={`/p/${p.slug}`}
              className="group flex flex-col gap-1 rounded-xl px-4 py-3.5 transition-colors hover:bg-white/5"
              style={{
                backgroundColor: "var(--bg-secondary)",
                border: "1px solid var(--border-medium)",
              }}
            >
              <span className="font-medium truncate group-hover:text-blue-400 transition-colors">
                {p.name}
              </span>
              {p.description && (
                <span
                  className="text-xs truncate"
                  style={{ color: "var(--text-muted)" }}
                >
                  {p.description}
                </span>
              )}
              <span
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                {p.ticketCount ?? 0} ticket{p.ticketCount !== 1 ? "s" : ""}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
