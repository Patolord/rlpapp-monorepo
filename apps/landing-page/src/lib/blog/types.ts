import type { SanityImageSource } from "@sanity/image-url";
import type { PortableBlock } from "./portable-text";

/** Categorias do blog. O slug é o identificador usado no site e no Sanity. */
export const BLOG_CATEGORIES = {
  "guia-pratico": {
    slug: "guia-pratico",
    title: "Guia prático",
    description:
      "Conteúdo direto para síndicos, gestores e quem cuida de um prédio no dia a dia.",
  },
  "para-construtoras": {
    slug: "para-construtoras",
    title: "Para construtoras",
    description:
      "Conteúdo técnico para construtoras, empreiteiras e equipes de engenharia de obra.",
  },
} as const;

export type BlogCategorySlug = keyof typeof BLOG_CATEGORIES;

export type BlogCategory = {
  title: string;
  slug: string;
};

/** Capa estática servida de `public/` (usada pelos posts locais). */
export type BlogCover = {
  src: string;
  alt: string;
};

/** Como um artigo local é escrito (ver `posts/`). */
export type LocalPostInput = {
  slug: string;
  title: string;
  /** ISO 8601 com fuso, ex.: 2026-03-10T09:00:00-03:00 */
  publishedAt: string;
  excerpt: string;
  category: BlogCategorySlug;
  cover: BlogCover;
  /** Corpo em Markdown (subconjunto suportado por `markdownToPortableText`). */
  body: string;
};

/** Artigo local já convertido (ver `posts/index.ts`). */
export type LocalPost = LocalPostInput & { blocks: PortableBlock[] };

/** Post normalizado, venha do Sanity ou do repositório. */
export type BlogPost = {
  _id: string;
  slug: string;
  title: string;
  publishedAt: string;
  excerpt: string;
  category: BlogCategory | null;
  cover: BlogCover | null;
  image: SanityImageSource | null;
  body: PortableBlock[] | null;
  readingMinutes: number | null;
  source: "local" | "sanity";
};
