import { redirect } from "next/navigation";
import { getProjectBySlug, getProjects } from "@/db/data/projects";
import { ProjectHeader } from "@/components/layout/project-header";
import { AgentActivityView } from "@/components/board/agent-activity-view";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [project, allProjects] = await Promise.all([
    getProjectBySlug(slug),
    getProjects(),
  ]);

  if (!project) {
    redirect("/board");
  }

  return (
    <div className="flex flex-col h-full">
      <ProjectHeader project={project} allProjects={allProjects} />
      <div className="flex-1 overflow-hidden">
        <AgentActivityView projectSlug={slug} />
      </div>
    </div>
  );
}
