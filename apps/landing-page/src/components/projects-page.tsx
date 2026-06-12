"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Search, ChevronLeft, ChevronRight, MoreHorizontal, X } from "lucide-react";
import { useQueryState, parseAsString, parseAsInteger } from "nuqs";
import { projectsData } from "../data/project-data";

export default function ProjectsPage() {
  // Usando nuqs para sincronizar filtros com a URL
  const [currentPage, setCurrentPage] = useQueryState(
    "pagina",
    parseAsInteger.withDefault(1).withOptions({ history: "push" })
  );
  const [searchTerm, setSearchTermRaw] = useQueryState(
    "busca",
    parseAsString.withDefault("").withOptions({ history: "push" })
  );
  const [selectedCategory, setSelectedCategoryRaw] = useQueryState(
    "categoria",
    parseAsString.withDefault("all").withOptions({ history: "push" })
  );
  const [selectedClient, setSelectedClientRaw] = useQueryState(
    "cliente",
    parseAsString.withDefault("all").withOptions({ history: "push" })
  );
  const [selectedYear, setSelectedYearRaw] = useQueryState(
    "ano",
    parseAsString.withDefault("all").withOptions({ history: "push" })
  );

  // Mudar qualquer filtro volta para a primeira página
  const setSearchTerm = (value: string) => {
    void setSearchTermRaw(value);
    void setCurrentPage(1);
  };
  const setSelectedCategory = (value: string) => {
    void setSelectedCategoryRaw(value);
    void setCurrentPage(1);
  };
  const setSelectedClient = (value: string) => {
    void setSelectedClientRaw(value);
    void setCurrentPage(1);
  };
  const setSelectedYear = (value: string) => {
    void setSelectedYearRaw(value);
    void setCurrentPage(1);
  };
  
  // State para tratamento de erros de imagem
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  // State para controlar o dropdown de filtros no mobile
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Contador de filtros ativos
  const activeFiltersCount =
    (searchTerm && searchTerm !== "" ? 1 : 0) +
    (selectedCategory !== "all" ? 1 : 0) +
    (selectedClient !== "all" ? 1 : 0) +
    (selectedYear !== "all" ? 1 : 0);

  // Filter projects based on search term, category, client, and year
  const filteredProjects = useMemo(() => {
    let results = projectsData;

    if (searchTerm) {
      results = results.filter(
        (project) =>
          project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          project.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedCategory !== "all") {
      results = results.filter(
        (project) => project.category === selectedCategory
      );
    }

    if (selectedClient !== "all") {
      results = results.filter((project) => {
        if (Array.isArray(project.client)) {
          return project.client.includes(selectedClient);
        }
        return project.client === selectedClient;
      });
    }

    if (selectedYear !== "all") {
      results = results.filter(
        (project) => project.year.toString() === selectedYear
      );
    }

    return results;
  }, [searchTerm, selectedCategory, selectedClient, selectedYear]);

  const projectsPerPage = 12;
  const totalPages = Math.ceil(filteredProjects.length / projectsPerPage);

  // Get all unique categories and years for filters
  const categories = [
    "all",
    ...new Set(projectsData.map((project) => project.category)),
  ];
  const clients = [
    "all",
    ...[...new Set(
      projectsData.flatMap((project) =>
        Array.isArray(project.client) ? project.client : [project.client]
      )
    )].sort(),
  ];
  const years = [
    "all",
    ...new Set(projectsData.map((project) => project.year.toString())),
  ];

  // Get category badge color
  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Climatização":
        return "bg-blue-100 text-blue-800";
      case "Pressurização e Detecção":
      case "Pressurização":
        return "bg-purple-100 text-purple-800";
      case "Detecção de Incêndios":
        return "bg-red-100 text-red-800";
      case "Refrigeração":
        return "bg-cyan-100 text-cyan-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Handle image load errors
  const handleImageError = (projectId: string) => {
    setImageErrors(prev => new Set(prev).add(projectId));
  };

  // Get current projects for pagination
  const indexOfLastProject = currentPage * projectsPerPage;
  const indexOfFirstProject = indexOfLastProject - projectsPerPage;
  const currentProjects = filteredProjects.slice(
    indexOfFirstProject,
    indexOfLastProject
  );

  // Change page
  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-8 sm:py-12 md:py-14 px-4 sm:px-6 md:px-12 pb-2 bg-white">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif mb-6 sm:mb-8 md:mb-10 text-blue-950">
            Nossos Projetos
          </h1>

          {/* Search and Filters */}
          <div className="max-w-3xl mx-auto mb-6 sm:mb-8">
            {/* Mobile/Tablet Layout: Search + Filtros Dropdown */}
            <div className="lg:hidden flex gap-2">
              <div className="relative flex-grow">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-950"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Buscar projetos..."
                  className="pl-10 pr-4 py-2 w-full rounded-full border border-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-blue-950 placeholder-blue-950/70 text-sm"
                  value={searchTerm || ""}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Botão de Filtros Mobile */}
              <button
                onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                className={`px-4 py-2 rounded-full border transition-colors flex items-center justify-center min-w-[44px] relative ${
                  activeFiltersCount > 0
                    ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                    : "bg-white text-blue-950 border-blue-950 hover:bg-gray-50"
                }`}
                aria-label="Filtros"
              >
                {isFiltersOpen ? <X size={20} /> : <MoreHorizontal size={20} />}
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-white text-blue-600 text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-md animate-bounce">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </div>

            {/* Dropdown de Filtros Mobile/Tablet */}
            {isFiltersOpen && (
              <div className="lg:hidden mt-3 p-4 bg-white rounded-lg border border-blue-950 shadow-lg space-y-3 animate-in slide-in-from-top-2">
                <select
                  className="px-4 py-2 rounded-full border border-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-blue-950 appearance-none pr-8 text-sm w-full"
                  value={selectedCategory || "all"}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23172554'%3E%3Cpath strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0.75rem center",
                    backgroundSize: "1rem",
                  }}
                >
                  <option value="all" className="bg-white">
                    Serviços
                  </option>
                  {categories
                    .filter((cat) => cat !== "all")
                    .map((category) => (
                      <option
                        key={category}
                        value={category}
                        className="bg-white"
                      >
                        {category}
                      </option>
                    ))}
                </select>

                <select
                  className="px-4 py-2 rounded-full border border-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-blue-950 appearance-none pr-8 text-sm w-full"
                  value={selectedClient || "all"}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23172554'%3E%3Cpath strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0.75rem center",
                    backgroundSize: "1rem",
                  }}
                >
                  <option value="all" className="bg-white">
                    Clientes
                  </option>
                  {clients
                    .filter((client) => client !== "all")
                    .map((client) => (
                      <option key={client} value={client} className="bg-white">
                        {client}
                      </option>
                    ))}
                </select>

                <select
                  className="px-4 py-2 rounded-full border border-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-blue-950 appearance-none pr-8 text-sm w-full"
                  value={selectedYear || "all"}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23172554'%3E%3Cpath strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0.75rem center",
                    backgroundSize: "1rem",
                  }}
                >
                  <option value="all" className="bg-white">
                    Anos
                  </option>
                  {years
                    .filter((year) => year !== "all")
                    .sort((a, b) => Number.parseInt(b) - Number.parseInt(a))
                    .map((year) => (
                      <option key={year} value={year} className="bg-white">
                        {year}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Desktop Layout: Search + Filtros inline */}
            <div className="hidden lg:flex flex-row gap-4">
              <div className="relative flex-grow">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-950"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Buscar projetos..."
                  className="pl-10 pr-4 py-2 w-full rounded-full border border-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-blue-950 placeholder-blue-950/70 text-sm sm:text-base"
                  value={searchTerm || ""}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex flex-row gap-4">
                <select
                  className="px-4 py-2 rounded-full border border-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-blue-950 appearance-none pr-8 text-sm sm:text-base"
                  value={selectedCategory || "all"}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23172554'%3E%3Cpath strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0.75rem center",
                    backgroundSize: "1rem",
                  }}
                >
                  <option value="all" className="bg-white">
                    Serviços
                  </option>
                  {categories
                    .filter((cat) => cat !== "all")
                    .map((category) => (
                      <option
                        key={category}
                        value={category}
                        className="bg-white"
                      >
                        {category}
                      </option>
                    ))}
                </select>

                <select
                  className="px-4 py-2 rounded-full border border-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-blue-950 appearance-none pr-8 text-sm sm:text-base"
                  value={selectedClient || "all"}
                  onChange={(e) => setSelectedClient(e.target.value)}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23172554'%3E%3Cpath strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0.75rem center",
                    backgroundSize: "1rem",
                  }}
                >
                  <option value="all" className="bg-white">
                    Clientes
                  </option>
                  {clients
                    .filter((client) => client !== "all")
                    .map((client) => (
                      <option key={client} value={client} className="bg-white">
                        {client}
                      </option>
                    ))}
                </select>

                <select
                  className="px-4 py-2 rounded-full border border-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-blue-950 appearance-none pr-8 text-sm sm:text-base"
                  value={selectedYear || "all"}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  style={{
                    backgroundImage:
                      "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23172554'%3E%3Cpath strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 0.75rem center",
                    backgroundSize: "1rem",
                  }}
                >
                  <option value="all" className="bg-white">
                    Anos
                  </option>
                  {years
                    .filter((year) => year !== "all")
                    .sort((a, b) => Number.parseInt(b) - Number.parseInt(a))
                    .map((year) => (
                      <option key={year} value={year} className="bg-white">
                        {year}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Filtros Ativos */}
            {activeFiltersCount > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {searchTerm && searchTerm !== "" && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2">
                    Busca: &quot;{searchTerm || ""}&quot;
                    <button
                      onClick={() => setSearchTerm("")}
                      className="hover:text-blue-950"
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
                {selectedCategory !== "all" && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2">
                    Serviço: {selectedCategory}
                    <button
                      onClick={() => setSelectedCategory("all")}
                      className="hover:text-blue-950"
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
                {selectedClient !== "all" && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2">
                    Cliente: {selectedClient}
                    <button
                      onClick={() => setSelectedClient("all")}
                      className="hover:text-blue-950"
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
                {selectedYear !== "all" && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2">
                    Ano: {selectedYear}
                    <button
                      onClick={() => setSelectedYear("all")}
                      className="hover:text-blue-950"
                    >
                      <X size={14} />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
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
                {currentProjects.map((project) => {
                  const hasImage = project.imageUrl && !imageErrors.has(project.id);
                  
                  return (
                    <div
                      key={project.id}
                      className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition duration-300"
                    >
                      {hasImage ? (
                        <>
                          <div className="relative h-48 sm:h-56 md:h-64">
                            <Image
                              src={project.imageUrl}
                              alt={project.title}
                              fill
                              className="object-cover"
                              onError={() => handleImageError(project.id)}
                            />
                          </div>
                          <div className="p-4 sm:p-6">
                            <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-4 mb-3 sm:mb-4">
                              <span
                                className={`px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getCategoryColor(
                                  project.category
                                )}`}
                              >
                                {project.category}
                              </span>
                              <span className="text-gray-500 text-sm">
                                {project.year}
                              </span>
                            </div>
                            <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3">
                              {project.title}
                            </h3>
                            <p className="text-gray-600 text-sm sm:text-base mb-3 sm:mb-4 line-clamp-2">
                              {project.description}
                            </p>
                            <Link
                              href={`/projetos/${project.id}`}
                              className="inline-flex items-center text-blue-600 hover:text-blue-800 transition text-sm sm:text-base"
                            >
                              Ver detalhes <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                          </div>
                        </>
                      ) : (
                        // No image card layout
                        <div className="p-4 sm:p-6 md:p-8 flex flex-col h-full">
                          <div className="flex flex-wrap items-center gap-2 mb-3 sm:mb-4">
                            <span
                              className={`px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium ${getCategoryColor(
                                project.category
                              )}`}
                            >
                              {project.category}
                            </span>
                            <span className="text-gray-500 text-xs sm:text-sm font-medium">
                              {project.year}
                            </span>
                          </div>
                          <h3 className="text-lg sm:text-xl md:text-2xl font-bold mb-2 sm:mb-3 md:mb-4 text-gray-900 line-clamp-2">
                            {project.title}
                          </h3>
                          <p className="text-gray-600 text-sm sm:text-base md:text-lg mb-4 sm:mb-6 leading-relaxed line-clamp-3 flex-grow">
                            {project.description}
                          </p>
                          <div className="mt-auto space-y-3">
                            {project.client && (
                              <div className="text-xs sm:text-sm text-gray-500 flex flex-wrap items-center gap-1">
                                <span className="font-medium">Cliente:</span>
                                <span className="line-clamp-1">
                                  {Array.isArray(project.client) 
                                    ? project.client.join(", ") 
                                    : project.client}
                                </span>
                              </div>
                            )}
                            <Link
                              href={`/projetos/${project.id}`}
                              className="inline-flex items-center justify-center bg-blue-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-md hover:bg-blue-700 transition font-medium text-sm w-full"
                            >
                              Ver detalhes <ArrowRight className="ml-2 h-3 w-3 sm:h-4 sm:w-4" />
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-wrap justify-center items-center gap-2 mt-6 sm:mt-8">
                  <button
                    onClick={() => paginate(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-full border border-gray-300 disabled:opacity-50"
                  >
                    <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (number) => (
                      <button
                        key={number}
                        onClick={() => paginate(number)}
                        className={`px-3 sm:px-4 py-1 sm:py-2 rounded-full text-sm sm:text-base ${
                          currentPage === number
                            ? "bg-blue-600 text-white"
                            : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        {number}
                      </button>
                    )
                  )}

                  <button
                    onClick={() =>
                      paginate(Math.min(totalPages, currentPage + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-full border border-gray-300 disabled:opacity-50"
                  >
                    <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
                  </button>
                </div>
              )}
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
