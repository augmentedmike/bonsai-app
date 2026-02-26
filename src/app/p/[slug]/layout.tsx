import { redirect } from "next/navigation";
import { getProjectBySlug } from "@/db/data/projects";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const project = await getProjectBySlug(slug);
  if (!project) {
    redirect("/board");
  }

  return (
    <div className="flex flex-col h-full">
      {children}
    </div>
  );
}
