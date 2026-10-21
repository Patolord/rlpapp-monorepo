"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProjectType } from "../lib/types";
import { getCategoryColor, getProjectClients } from "../lib/project-filters";

/**
 * Card de obra na listagem de /projetos.
 * É um client component apenas para tratar erro de carregamento da imagem;
 * o conteúdo (título, descrição, link) é renderizado no servidor.
 */
export default function ProjectCard({ project }: { project: ProjectType }) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(project.imageUrl) && !imageFailed;
  const clients = getProjectClients(project);

  return (
    <article className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition duration-300">
      {hasImage ? (
        <>
          <div className="relative h-48 sm:h-56 md:h-64">
            <Image
              src={project.imageUrl}
              alt={project.title}
              fill
              className="object-cover"
              onError={() => setImageFailed(true)}
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
              <span className="text-gray-500 text-sm">{project.year}</span>
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
        // Layout do card sem imagem
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
            {clients.length > 0 && (
              <div className="text-xs sm:text-sm text-gray-500 flex flex-wrap items-center gap-1">
                <span className="font-medium">Cliente:</span>
                <span className="line-clamp-1">{clients.join(", ")}</span>
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
    </article>
  );
}
