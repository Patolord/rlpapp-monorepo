import type { ProjectType } from "./types";

export const PROJECTS_PER_PAGE = 12;

/**
 * Nomes dos parâmetros de URL usados em /projetos.
 * Precisam ser os mesmos no servidor (searchParams) e no cliente (nuqs)
 * para que links antigos continuem funcionando.
 */
export const PROJECT_QUERY_KEYS = {
  page: "pagina",
  search: "busca",
  category: "categoria",
  client: "cliente",
  year: "ano",
} as const;

export type ProjectFilters = {
  page: number;
  search: string;
  category: string;
  client: string;
  year: string;
};

export const DEFAULT_PROJECT_FILTERS: ProjectFilters = {
  page: 1,
  search: "",
  category: "all",
  client: "all",
  year: "all",
};

type SearchParamsInput = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Converte os searchParams brutos da URL nos filtros da página,
 * com os mesmos defaults usados pelo nuqs no cliente.
 */
export function parseProjectFilters(params: SearchParamsInput): ProjectFilters {
  const rawPage = firstValue(params[PROJECT_QUERY_KEYS.page]);
  const parsedPage = rawPage ? Number.parseInt(rawPage, 10) : Number.NaN;

  return {
    page: Number.isFinite(parsedPage) ? parsedPage : DEFAULT_PROJECT_FILTERS.page,
    search: firstValue(params[PROJECT_QUERY_KEYS.search]) ?? DEFAULT_PROJECT_FILTERS.search,
    category: firstValue(params[PROJECT_QUERY_KEYS.category]) ?? DEFAULT_PROJECT_FILTERS.category,
    client: firstValue(params[PROJECT_QUERY_KEYS.client]) ?? DEFAULT_PROJECT_FILTERS.client,
    year: firstValue(params[PROJECT_QUERY_KEYS.year]) ?? DEFAULT_PROJECT_FILTERS.year,
  };
}

export function getProjectClients(project: ProjectType): string[] {
  if (!project.client) return [];
  return Array.isArray(project.client) ? project.client : [project.client];
}

/**
 * Aplica busca e filtros (categoria, cliente, ano) à lista de obras.
 */
export function filterProjects(
  projects: ProjectType[],
  filters: Pick<ProjectFilters, "search" | "category" | "client" | "year">
): ProjectType[] {
  let results = projects;

  if (filters.search) {
    const term = filters.search.toLowerCase();
    results = results.filter(
      (project) =>
        project.title.toLowerCase().includes(term) ||
        project.description.toLowerCase().includes(term)
    );
  }

  if (filters.category !== "all") {
    results = results.filter((project) => project.category === filters.category);
  }

  if (filters.client !== "all") {
    results = results.filter((project) =>
      getProjectClients(project).includes(filters.client)
    );
  }

  if (filters.year !== "all") {
    results = results.filter((project) => project.year.toString() === filters.year);
  }

  return results;
}

export function paginateProjects(
  projects: ProjectType[],
  page: number,
  perPage: number = PROJECTS_PER_PAGE
) {
  const totalPages = Math.ceil(projects.length / perPage);
  const indexOfLastProject = page * perPage;
  const indexOfFirstProject = indexOfLastProject - perPage;

  return {
    items: projects.slice(indexOfFirstProject, indexOfLastProject),
    totalPages,
  };
}

/**
 * Opções disponíveis nos selects de filtro (sem o valor "all").
 */
export function getProjectFilterOptions(projects: ProjectType[]) {
  const categories = [...new Set(projects.map((project) => project.category))];
  const clients = [...new Set(projects.flatMap(getProjectClients))].sort();
  const years = [...new Set(projects.map((project) => project.year.toString()))].sort(
    (a, b) => Number.parseInt(b) - Number.parseInt(a)
  );

  return { categories, clients, years };
}

/**
 * Monta a URL de /projetos para um conjunto de filtros, omitindo valores
 * padrão exatamente como o nuqs faz no cliente (clearOnDefault).
 */
export function buildProjectsHref(filters: ProjectFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set(PROJECT_QUERY_KEYS.search, filters.search);
  if (filters.category !== "all") params.set(PROJECT_QUERY_KEYS.category, filters.category);
  if (filters.client !== "all") params.set(PROJECT_QUERY_KEYS.client, filters.client);
  if (filters.year !== "all") params.set(PROJECT_QUERY_KEYS.year, filters.year);
  if (filters.page !== 1) params.set(PROJECT_QUERY_KEYS.page, String(filters.page));

  const query = params.toString();
  return query ? `/projetos?${query}` : "/projetos";
}

export function getCategoryColor(category: string): string {
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
}
