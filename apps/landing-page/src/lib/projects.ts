// Usar apenas em Server Components / metadata (acessa o filesystem no build).
import fs from "node:fs";
import path from "node:path";
import { projectsData } from "@/data/project-data";
import type { ProjectType } from "@/lib/types";
import { truncateDescription } from "@/lib/seo";

/**
 * Nem todos os projetos de `project-data.ts` têm foto em `public/`. Estas
 * funções rodam no servidor (build) e removem as referências a arquivos
 * inexistentes, para a página não renderizar imagens quebradas nem anunciar
 * um `og:image` que responde 404.
 */

const PUBLIC_DIR = path.join(process.cwd(), "public");
const publicDirAvailable = fs.existsSync(PUBLIC_DIR);
const existsCache = new Map<string, boolean>();

/** `true` se o arquivo existe em `public/` (ou se não dá para verificar). */
export function publicFileExists(url: string | undefined | null): boolean {
  if (!url) return false;
  if (/^https?:\/\//.test(url)) return true;
  // Sem acesso ao diretório (ex.: runtime serverless), mantém o comportamento antigo.
  if (!publicDirAvailable) return true;
  const cached = existsCache.get(url);
  if (cached !== undefined) return cached;
  const exists = fs.existsSync(path.join(PUBLIC_DIR, url.split(/[?#]/)[0]));
  existsCache.set(url, exists);
  return exists;
}

/** Projeto com `imageUrl`/`galleryImages` apontando só para arquivos existentes. */
export function sanitizeProject(project: ProjectType): ProjectType {
  const gallery = (project.galleryImages ?? []).filter(publicFileExists);
  const cover = publicFileExists(project.imageUrl)
    ? project.imageUrl
    : (gallery[0] ?? "");
  return { ...project, imageUrl: cover, galleryImages: gallery };
}

export function getAllProjects(): ProjectType[] {
  return projectsData.map(sanitizeProject);
}

export function getProjectById(id: string): ProjectType | null {
  const project = projectsData.find((item) => item.id === id);
  return project ? sanitizeProject(project) : null;
}

/** Outros projetos da mesma categoria (primeiro os que têm foto). */
export function getRelatedProjects(project: ProjectType, limit = 3): ProjectType[] {
  const candidates = projectsData
    .filter((item) => item.category === project.category && item.id !== project.id)
    .map(sanitizeProject);
  const withImage = candidates.filter((item) => item.imageUrl);
  const withoutImage = candidates.filter((item) => !item.imageUrl);
  return [...withImage, ...withoutImage].slice(0, limit);
}

export function projectClientLabel(project: ProjectType): string | null {
  if (!project.client) return null;
  return Array.isArray(project.client) ? project.client.join(", ") : project.client;
}

/** Meta description curta e legível para a página de um projeto. */
export function projectMetaDescription(project: ProjectType): string {
  const base = truncateDescription(project.description, 150);
  const extras = [
    project.category,
    project.location && project.location.length <= 30 ? project.location : null,
    project.year ? String(project.year) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const suffix = extras ? ` (${extras})` : "";
  return base.length + suffix.length <= 158 ? `${base}${suffix}` : base;
}
