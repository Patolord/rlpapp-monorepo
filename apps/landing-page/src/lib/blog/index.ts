import { createImageUrlBuilder } from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url";
import { client } from "@/sanity/client";
import { localPosts } from "./posts";
import {
  countWords,
  portableTextToPlain,
  readingMinutes,
  type PortableBlock,
} from "./portable-text";
import {
  BLOG_CATEGORIES,
  type BlogCategorySlug,
  type BlogPost,
  type LocalPost,
} from "./types";

export { BLOG_CATEGORIES } from "./types";
export type { BlogPost, BlogCategory, BlogCategorySlug } from "./types";

/**
 * Fonte dos posts:
 *  - `posts/` (locais, versionados no repositório) — garantem o blog no ar
 *    mesmo sem acesso ao Sanity;
 *  - Sanity (projeto `eharrlqv`, dataset `production`) — posts criados no
 *    Studio. Quando o mesmo slug existe nos dois lugares, o Sanity prevalece
 *    (mantendo a capa local caso o documento não tenha imagem).
 */

const REVALIDATE_SECONDS = 60;

const POST_FIELDS = `
  _id,
  title,
  "slug": slug.current,
  publishedAt,
  excerpt,
  image,
  "category": category->{ title, "slug": slug.current },
  "bodyText": pt::text(body)
`;

const SANITY_LIST_QUERY = `*[_type == "post" && defined(slug.current)] | order(publishedAt desc) { ${POST_FIELDS} }`;
const SANITY_ONE_QUERY = `*[_type == "post" && slug.current == $slug][0] { ${POST_FIELDS}, body }`;

type SanityPost = {
  _id: string;
  title?: string;
  slug?: string;
  publishedAt?: string;
  excerpt?: string;
  image?: SanityImageSource | null;
  category?: { title?: string; slug?: string } | null;
  bodyText?: string | null;
  body?: PortableBlock[] | null;
};

const { projectId, dataset } = client.config();
const imageBuilder =
  projectId && dataset ? createImageUrlBuilder({ projectId, dataset }) : null;

/** URL da imagem de um post (Sanity ou capa local), ou `null`. */
export function postImageUrl(
  post: Pick<BlogPost, "image" | "cover">,
  width: number,
  height: number
): string | null {
  if (post.image && imageBuilder) {
    return imageBuilder.image(post.image).width(width).height(height).url();
  }
  return post.cover?.src ?? null;
}

export function postImageAlt(post: Pick<BlogPost, "cover" | "title">): string {
  return post.cover?.alt ?? post.title;
}

function normalizeLocal(input: LocalPost): BlogPost {
  const category = BLOG_CATEGORIES[input.category];
  return {
    _id: `post-${input.slug}`,
    slug: input.slug,
    title: input.title,
    publishedAt: input.publishedAt,
    excerpt: input.excerpt,
    category: { title: category.title, slug: category.slug },
    cover: input.cover,
    image: null,
    body: input.blocks,
    readingMinutes: readingMinutes(countWords(portableTextToPlain(input.blocks))),
    source: "local",
  };
}

function normalizeSanity(doc: SanityPost, local?: BlogPost): BlogPost {
  const words = doc.bodyText
    ? countWords(doc.bodyText)
    : doc.body
      ? countWords(portableTextToPlain(doc.body))
      : null;

  return {
    _id: doc._id,
    slug: doc.slug ?? local?.slug ?? doc._id,
    title: doc.title ?? local?.title ?? "",
    publishedAt: doc.publishedAt ?? local?.publishedAt ?? new Date(0).toISOString(),
    excerpt: doc.excerpt ?? local?.excerpt ?? "",
    category:
      doc.category?.title && doc.category?.slug
        ? { title: doc.category.title, slug: doc.category.slug }
        : (local?.category ?? null),
    cover: local?.cover ?? null,
    image: doc.image ?? null,
    body: doc.body ?? local?.body ?? null,
    readingMinutes: words !== null ? readingMinutes(words) : (local?.readingMinutes ?? null),
    source: "sanity",
  };
}

async function fetchSanity<T>(query: string, params: Record<string, string> = {}): Promise<T | null> {
  try {
    return await client.fetch<T>(query, params, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
  } catch (error) {
    // Sem rede, sem permissão ou dataset vazio: o blog segue com os posts locais.
    console.warn("[blog] Sanity indisponível; usando apenas posts locais.", error);
    return null;
  }
}

function isPublished(post: BlogPost, now: number): boolean {
  const time = Date.parse(post.publishedAt);
  return Number.isNaN(time) || time <= now;
}

const localNormalized: BlogPost[] = localPosts.map(normalizeLocal);
const localBySlug = new Map(localNormalized.map((post) => [post.slug, post]));

/** Todos os posts publicados (Sanity + locais), do mais recente ao mais antigo. */
export async function getAllPosts(options?: {
  category?: BlogCategorySlug | string | null;
}): Promise<BlogPost[]> {
  const remote = (await fetchSanity<SanityPost[]>(SANITY_LIST_QUERY)) ?? [];
  const merged = new Map<string, BlogPost>(localBySlug);

  for (const doc of remote) {
    if (!doc.slug) continue;
    merged.set(doc.slug, normalizeSanity(doc, localBySlug.get(doc.slug)));
  }

  const now = Date.now();
  let posts = [...merged.values()]
    .filter((post) => isPublished(post, now))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  if (options?.category) {
    posts = posts.filter((post) => post.category?.slug === options.category);
  }
  return posts;
}

/** Um post pelo slug, com corpo. `null` se não existir em nenhuma fonte. */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  const local = localBySlug.get(slug);
  const remote = await fetchSanity<SanityPost | null>(SANITY_ONE_QUERY, { slug });

  if (remote && remote.slug) return normalizeSanity(remote, local);
  if (local && isPublished(local, Date.now())) return local;
  return null;
}

/** Outros posts da mesma categoria (para "Leia também"). */
export async function getRelatedPosts(post: BlogPost, limit = 3): Promise<BlogPost[]> {
  const all = await getAllPosts();
  const sameCategory = all.filter(
    (candidate) =>
      candidate.slug !== post.slug &&
      candidate.category?.slug === post.category?.slug
  );
  const others = all.filter(
    (candidate) => candidate.slug !== post.slug && !sameCategory.includes(candidate)
  );
  return [...sameCategory, ...others].slice(0, limit);
}

export function formatPostDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
}
