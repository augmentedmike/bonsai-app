"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Project } from "@/types";
import { ProjectSelector } from "@/components/board/project-selector";

interface ProjectHeaderProps {
  project: Project;
  allProjects: Project[];
}

export function ProjectHeader({ project, allProjects }: ProjectHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Extract sub-path after /p/[slug]/ (e.g. "board", "activity", "team", "settings")
  function handleSwitch(newSlug: string) {
    const match = pathname.match(/^\/p\/[^/]+\/(.+)$/);
    const subPath = match ? match[1] : "board";
    // Always land on the board when switching from the new-ticket page
    const target = subPath === "new-ticket" ? "board" : subPath;
    router.push(`/p/${newSlug}/${target}`);
  }

  return (
    <div
      className="flex items-center px-6 py-2 border-b"
      style={{ borderColor: "var(--border-subtle)" }}
    >
      <ProjectSelector
        project={project}
        allProjects={allProjects}
        onSwitch={handleSwitch}
      />
    </div>
  );
}
