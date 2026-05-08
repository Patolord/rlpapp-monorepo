import ProjectDetail from "../../../components/project-detail"
import { projectsData } from "../../../data/project-data"
import { notFound } from "next/navigation"
import type { Metadata } from "next"

export function generateStaticParams() {
  return projectsData.map((project) => ({
    id: project.id,
  }))
}

type Props = {
  params: Promise<{
    id: string
  }>
}

// Gera metadados dinâmicos para cada projeto (SEO e compartilhamento)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params
  const project = projectsData.find((p) => p.id === resolvedParams.id)

  if (!project) {
    return {
      title: "Projeto não encontrado - RLP Engenharia",
    }
  }

  const clientName = Array.isArray(project.client) 
    ? project.client.join(", ") 
    : project.client

  return {
    title: `${project.title} - RLP Engenharia`,
    description: `${project.description} Cliente: ${clientName}. ${project.category} - ${project.year}`,
    openGraph: {
      title: `${project.title} - RLP Engenharia`,
      description: project.description,
      images: project.imageUrl ? [
        {
          url: project.imageUrl,
          width: 1200,
          height: 630,
          alt: project.title,
        }
      ] : [],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${project.title} - RLP Engenharia`,
      description: project.description,
      images: project.imageUrl ? [project.imageUrl] : [],
    },
  }
}

export default async function ProjectPage({ params }: Props) {
  const resolvedParams = await params
  const project = projectsData.find((p) => p.id === resolvedParams.id)

  if (!project) {
    notFound()
  }

  return (
    <>
      <ProjectDetail project={project} />
    </>
  )
}
