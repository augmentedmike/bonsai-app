import { redirect } from "next/navigation";
import { getProjectBySlug } from "@/db/data/projects";
import { isTeamComplete } from "@/db/data/personas";

export const dynamic = "force-dynamic";

export default async function TeamOnboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) redirect("/onboard/project");
  // Already has a team → go to board
  if (await isTeamComplete(Number(project.id))) {
    redirect(`/p/${slug}`);
  }
  return (
    <div className="min-h-screen w-full" style={{ backgroundColor: "var(--bg-primary)" }}>
      {children}
    </div>
  );
}
