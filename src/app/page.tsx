import { getProjects } from "@/db/data/projects";
import { ProjectsDashboard } from "@/components/projects/projects-dashboard";

export default async function Home() {
  const projects = await getProjects();
  return <ProjectsDashboard initialProjects={projects} />;
}
