import { getProjects, getHiddenProjectCount } from "@/db/data/projects";
import { ProjectsDashboard } from "@/components/projects/projects-dashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = await getProjects();
  const hiddenCount = getHiddenProjectCount();
  return <ProjectsDashboard initialProjects={projects} initialHiddenCount={hiddenCount} />;
}
