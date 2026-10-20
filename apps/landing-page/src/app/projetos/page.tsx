import type { Metadata } from "next";
import { Suspense } from "react";
import ProjectsPage from "@/components/projects-page";
import JsonLd from "@/components/JsonLd";
import { getAllProjects } from "@/lib/projects";
import { breadcrumbJsonLd, jsonLdGraph, pageOpenGraph } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Projetos e Obras Realizadas",
  description:
    "Obras de climatização, refrigeração, pressurização de escadas e detecção de incêndio executadas pela RLP Engenharia para construtoras, indústrias e condomínios.",
  // Filtros e paginação (?categoria=, ?pagina=…) são variações da mesma lista.
  alternates: { canonical: "/projetos" },
  openGraph: pageOpenGraph({
    url: "/projetos",
    title: "Projetos e Obras Realizadas | RLP Engenharia",
    description:
      "Portfólio de obras de HVAC e proteção contra incêndio da RLP Engenharia em São Paulo.",
  }),
};

// A lista lê os filtros da URL (nuqs/useSearchParams). Renderizar sob demanda
// faz o HTML já sair com os projetos, em vez do fallback "Carregando...".
export const dynamic = "force-dynamic";

export default function Page() {
  const projects = getAllProjects();

  return (
    <>
      <JsonLd
        data={jsonLdGraph(
          breadcrumbJsonLd([
            { name: "Início", path: "/" },
            { name: "Projetos", path: "/projetos" },
          ])
        )}
      />
      <Suspense fallback={<div className="min-h-screen px-6 py-12">Carregando...</div>}>
        <ProjectsPage projects={projects} />
      </Suspense>
    </>
  );
}
