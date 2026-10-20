import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProjectDetail from "@/components/project-detail";
import JsonLd from "@/components/JsonLd";
import { projectsData } from "@/data/project-data";
import {
  getProjectById,
  getRelatedProjects,
  projectClientLabel,
  projectMetaDescription,
} from "@/lib/projects";
import { breadcrumbJsonLd, jsonLdGraph, pageOpenGraph } from "@/lib/seo";
import { OG_IMAGE, absoluteUrl } from "@/lib/site";

export function generateStaticParams() {
  return projectsData.map((project) => ({ id: project.id }));
}

type Props = {
  params: Promise<{ id: string }>;
};

// Metadados por projeto (título, description, canonical e compartilhamento)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const project = getProjectById(id);

  if (!project) {
    return { title: "Projeto não encontrado", robots: { index: false } };
  }

  const description = projectMetaDescription(project);
  const path = `/projetos/${project.id}`;
  const image = project.imageUrl
    ? [{ url: project.imageUrl, alt: `Projeto ${project.title}` }]
    : undefined;

  return {
    title: project.title,
    description,
    alternates: { canonical: path },
    openGraph: pageOpenGraph({
      type: "article",
      url: path,
      title: `${project.title} | RLP Engenharia`,
      description,
      ...(image ? { images: image } : {}),
    }),
    twitter: {
      card: "summary_large_image",
      title: `${project.title} | RLP Engenharia`,
      description,
      images: [image ? project.imageUrl : OG_IMAGE.url],
    },
  };
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const project = getProjectById(id);

  if (!project) {
    notFound();
  }

  const related = getRelatedProjects(project);
  const client = projectClientLabel(project);

  return (
    <>
      <JsonLd
        data={jsonLdGraph(
          breadcrumbJsonLd([
            { name: "Início", path: "/" },
            { name: "Projetos", path: "/projetos" },
            { name: project.title, path: `/projetos/${project.id}` },
          ]),
          {
            "@type": "CreativeWork",
            name: project.title,
            description: project.description,
            ...(project.imageUrl ? { image: absoluteUrl(project.imageUrl) } : {}),
            ...(client ? { sourceOrganization: { "@type": "Organization", name: client } } : {}),
            ...(project.location ? { locationCreated: { "@type": "Place", name: project.location } } : {}),
            dateCreated: String(project.year),
            genre: project.category,
            inLanguage: "pt-BR",
            creator: { "@type": "Organization", name: "RLP Engenharia" },
          }
        )}
      />
      <ProjectDetail project={project} relatedProjects={related} />
    </>
  );
}
