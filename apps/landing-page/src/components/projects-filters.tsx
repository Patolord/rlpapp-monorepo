"use client";

import { useState, useTransition } from "react";
import { Search, MoreHorizontal, X } from "lucide-react";
import {
  useQueryStates,
  parseAsString,
  parseAsInteger,
  debounce,
} from "nuqs";
import {
  DEFAULT_PROJECT_FILTERS,
  PROJECT_QUERY_KEYS,
} from "../lib/project-filters";

const SELECT_ARROW_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23172554'%3E%3Cpath strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.75rem center",
  backgroundSize: "1rem",
} as const;

const SELECT_BASE_CLASS =
  "px-4 py-2 rounded-full border border-blue-950 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white text-blue-950 appearance-none pr-8";

const filterParsers = {
  page: parseAsInteger.withDefault(DEFAULT_PROJECT_FILTERS.page),
  search: parseAsString.withDefault(DEFAULT_PROJECT_FILTERS.search),
  category: parseAsString.withDefault(DEFAULT_PROJECT_FILTERS.category),
  client: parseAsString.withDefault(DEFAULT_PROJECT_FILTERS.client),
  year: parseAsString.withDefault(DEFAULT_PROJECT_FILTERS.year),
};

type ProjectsFiltersProps = {
  categories: string[];
  clients: string[];
  years: string[];
};

/**
 * Controles interativos de /projetos (busca, selects e chips de filtros ativos).
 * Sincroniza o estado com a URL via nuqs; a lista de obras em si é
 * renderizada no servidor a partir dos mesmos parâmetros.
 */
export default function ProjectsFilters({
  categories,
  clients,
  years,
}: ProjectsFiltersProps) {
  const [, startTransition] = useTransition();

  const [filters, setFilters] = useQueryStates(filterParsers, {
    urlKeys: PROJECT_QUERY_KEYS,
    history: "push",
    // A grade de obras é renderizada no servidor: a navegação precisa
    // chegar ao servidor para que os resultados sejam atualizados.
    shallow: false,
    startTransition,
  });

  const searchTerm = filters.search;
  const selectedCategory = filters.category;
  const selectedClient = filters.client;
  const selectedYear = filters.year;

  // Mudar qualquer filtro volta para a primeira página
  const setSearchTerm = (value: string) => {
    void setFilters(
      { search: value, page: DEFAULT_PROJECT_FILTERS.page },
      { limitUrlUpdates: value === "" ? undefined : debounce(300) }
    );
  };
  const setSelectedCategory = (value: string) => {
    void setFilters({ category: value, page: DEFAULT_PROJECT_FILTERS.page });
  };
  const setSelectedClient = (value: string) => {
    void setFilters({ client: value, page: DEFAULT_PROJECT_FILTERS.page });
  };
  const setSelectedYear = (value: string) => {
    void setFilters({ year: value, page: DEFAULT_PROJECT_FILTERS.page });
  };

  // State para controlar o dropdown de filtros no mobile
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  // Contador de filtros ativos
  const activeFiltersCount =
    (searchTerm && searchTerm !== "" ? 1 : 0) +
    (selectedCategory !== "all" ? 1 : 0) +
    (selectedClient !== "all" ? 1 : 0) +
    (selectedYear !== "all" ? 1 : 0);

  const renderSelects = (sizeClass: string) => (
    <>
      <select
        className={`${SELECT_BASE_CLASS} ${sizeClass}`}
        value={selectedCategory || "all"}
        onChange={(e) => setSelectedCategory(e.target.value)}
        style={SELECT_ARROW_STYLE}
        aria-label="Filtrar por serviço"
      >
        <option value="all" className="bg-white">
          Serviços
        </option>
        {categories.map((category) => (
          <option key={category} value={category} className="bg-white">
            {category}
          </option>
        ))}
      </select>

      <select
        className={`${SELECT_BASE_CLASS} ${sizeClass}`}
        value={selectedClient || "all"}
        onChange={(e) => setSelectedClient(e.target.value)}
        style={SELECT_ARROW_STYLE}
        aria-label="Filtrar por cliente"
      >
        <option value="all" className="bg-white">
          Clientes
        </option>
        {clients.map((client) => (
          <option key={client} value={client} className="bg-white">
            {client}
          </option>
        ))}
      </select>

      <select
        className={`${SELECT_BASE_CLASS} ${sizeClass}`}
        value={selectedYear || "all"}
        onChange={(e) => setSelectedYear(e.target.value)}
        style={SELECT_ARROW_STYLE}
        aria-label="Filtrar por ano"
      >
        <option value="all" className="bg-white">
          Anos
        </option>
        {years.map((year) => (
          <option key={year} value={year} className="bg-white">
            {year}
          </option>
        ))}
      </select>
    </>
  );

  return (
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
          type="button"
          onClick={() => setIsFiltersOpen(!isFiltersOpen)}
          className={`px-4 py-2 rounded-full border transition-colors flex items-center justify-center min-w-[44px] relative ${
            activeFiltersCount > 0
              ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
              : "bg-white text-blue-950 border-blue-950 hover:bg-gray-50"
          }`}
          aria-label="Filtros"
          aria-expanded={isFiltersOpen}
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
          {renderSelects("text-sm w-full")}
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

        <div className="flex flex-row gap-4">{renderSelects("text-sm sm:text-base")}</div>
      </div>

      {/* Filtros Ativos */}
      {activeFiltersCount > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {searchTerm && searchTerm !== "" && (
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2">
              Busca: &quot;{searchTerm || ""}&quot;
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="hover:text-blue-950"
                aria-label="Limpar busca"
              >
                <X size={14} />
              </button>
            </span>
          )}
          {selectedCategory !== "all" && (
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2">
              Serviço: {selectedCategory}
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className="hover:text-blue-950"
                aria-label="Limpar filtro de serviço"
              >
                <X size={14} />
              </button>
            </span>
          )}
          {selectedClient !== "all" && (
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2">
              Cliente: {selectedClient}
              <button
                type="button"
                onClick={() => setSelectedClient("all")}
                className="hover:text-blue-950"
                aria-label="Limpar filtro de cliente"
              >
                <X size={14} />
              </button>
            </span>
          )}
          {selectedYear !== "all" && (
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-2">
              Ano: {selectedYear}
              <button
                type="button"
                onClick={() => setSelectedYear("all")}
                className="hover:text-blue-950"
                aria-label="Limpar filtro de ano"
              >
                <X size={14} />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
