import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import ProjectsFilters from "../../components/projects-filters";
import ProjectCard from "../../components/project-card";
import ProjectsPagination from "../../components/projects-pagination";
import { projectsData } from "../../data/project-data";
import {
  filterProjects,
  getProjectFilterOptions,
  paginateProjects,
  parseProjectFilters,
} from "../../lib/project-filters";

export const metadata: Metadata = {
  title: "Obras de HVAC e Pressurização para Construtoras em SP",
  description:
    "Portfólio com mais de 230 obras de climatização, pressurização de escadas, extração de fumaça e refrigeração executadas pela RLP Engenharia para construtoras como Brookfield, Tegra e Fresno em São Paulo e região.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const filterOptions = getProjectFilterOptions(projectsData);

export default async function Page({ searchParams }: Props) {
  const filters = parseProjectFilters(await searchParams);
  const filteredProjects = filterProjects(projectsData, filters);
  const { items: currentProjects, totalPages } = paginateProjects(
    filteredProjects,
    filters.page
  );

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-8 sm:py-12 md:py-14 px-4 sm:px-6 md:px-12 pb-2 bg-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif mb-6 sm:mb-8 md:mb-10 text-blue-950">
            Nossos Projetos
          </h1>

          {/* Search and Filters (client, sincronizados com a URL) */}
          <Suspense fallback={<div className="max-w-3xl mx-auto mb-6 sm:mb-8 h-10" />}>
            <ProjectsFilters
              categories={filterOptions.categories}
              clients={filterOptions.clients}
              years={filterOptions.years}
            />
          </Suspense>
        </div>
      </section>

      {/* Projects Grid */}
      <section className="py-8 sm:py-2 md:py-2 px-4 sm:px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          {filteredProjects.length === 0 ? (
            <div className="text-center py-8 sm:py-2 md:py-2">
              <h3 className="text-xl sm:text-2xl font-semibold text-gray-700 mb-4">
                Nenhum projeto encontrado
              </h3>
              <p className="text-gray-500">
                Tente ajustar seus filtros ou termos de busca.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 md:grid-cols-3 gap-8  sm:gap-6 md:gap-8 mb-8 sm:mb-10 md:mb-12">
                {currentProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>

              <ProjectsPagination filters={filters} totalPages={totalPages} />
            </>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-8 sm:py-12 md:py-16 px-4 sm:px-6 md:px-12 bg-blue-600 text-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">
            Pronto para iniciar seu projeto?
          </h2>
          <p className="text-lg sm:text-xl mb-6 sm:mb-8 opacity-90">
            Nossa equipe de especialistas está pronta para desenvolver a solução
            ideal para seu projeto.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://wa.me/5511985782307?text=Olá,%20gostaria%20de%20solicitar%20um%20orçamento"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-blue-600 px-6 sm:px-8 py-3 sm:py-4 rounded-md hover:bg-gray-100 transition font-bold text-sm sm:text-base"
            >
              Solicitar orçamento
            </a>
            <Link
              href="/#contato"
              className="bg-blue-700 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-md hover:bg-blue-800 transition border border-blue-500 text-sm sm:text-base"
            >
              Falar com um especialista
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
