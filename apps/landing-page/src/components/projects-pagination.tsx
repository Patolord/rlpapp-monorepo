import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildProjectsHref, type ProjectFilters } from "../lib/project-filters";

type ProjectsPaginationProps = {
  filters: ProjectFilters;
  totalPages: number;
};

const ARROW_CLASS = "p-2 rounded-full border border-gray-300";

/**
 * Paginação de /projetos renderizada no servidor com links reais,
 * para que todas as páginas da listagem sejam indexáveis.
 */
export default function ProjectsPagination({
  filters,
  totalPages,
}: ProjectsPaginationProps) {
  if (totalPages <= 1) return null;

  const currentPage = filters.page;
  const hrefFor = (page: number) => buildProjectsHref({ ...filters, page });
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <nav
      aria-label="Paginação de projetos"
      className="flex flex-wrap justify-center items-center gap-2 mt-6 sm:mt-8"
    >
      {currentPage > 1 ? (
        <Link
          href={hrefFor(currentPage - 1)}
          className={ARROW_CLASS}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Link>
      ) : (
        <span className={`${ARROW_CLASS} opacity-50`} aria-disabled="true">
          <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      )}

      {pages.map((number) =>
        number === currentPage ? (
          <span
            key={number}
            aria-current="page"
            className="px-3 sm:px-4 py-1 sm:py-2 rounded-full text-sm sm:text-base bg-blue-600 text-white"
          >
            {number}
          </span>
        ) : (
          <Link
            key={number}
            href={hrefFor(number)}
            className="px-3 sm:px-4 py-1 sm:py-2 rounded-full text-sm sm:text-base bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
          >
            {number}
          </Link>
        )
      )}

      {currentPage < totalPages ? (
        <Link
          href={hrefFor(currentPage + 1)}
          className={ARROW_CLASS}
          aria-label="Próxima página"
        >
          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </Link>
      ) : (
        <span className={`${ARROW_CLASS} opacity-50`} aria-disabled="true">
          <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
        </span>
      )}
    </nav>
  );
}
