import type { MetadataRoute } from "next";
import { client } from "@/sanity/client";
import { projectsData } from "@/data/project-data";

const SITE_URL = "https://rlpeng.com.br";

const POST_SLUGS_QUERY = `*[_type == "post" && defined(slug.current)]{
  "slug": slug.current,
  publishedAt,
  _updatedAt
}`;

type PostEntry = {
  slug: string;
  publishedAt?: string;
  _updatedAt?: string;
};

type StaticRoute = {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
};

const STATIC_ROUTES: StaticRoute[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/servicos", changeFrequency: "monthly", priority: 0.9 },
  { path: "/manutencao", changeFrequency: "monthly", priority: 0.8 },
  { path: "/projetos", changeFrequency: "weekly", priority: 0.8 },
  { path: "/sobre", changeFrequency: "monthly", priority: 0.7 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/carreiras", changeFrequency: "monthly", priority: 0.5 },
  { path: "/politica-privacidade", changeFrequency: "yearly", priority: 0.2 },
];

function toDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

async function fetchBlogEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const posts = await client.fetch<PostEntry[]>(
      POST_SLUGS_QUERY,
      {},
      { next: { revalidate: 3600 } },
    );

    return posts
      .filter((post) => typeof post.slug === "string" && post.slug.length > 0)
      .map((post) => ({
        url: `${SITE_URL}/blog/${encodeURIComponent(post.slug)}`,
        lastModified: toDate(post._updatedAt ?? post.publishedAt, now),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      }));
  } catch (error) {
    // Uma indisponibilidade do Sanity nunca deve derrubar o build nem o sitemap.
    console.error("[sitemap] Falha ao buscar posts do Sanity:", error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  const projectEntries: MetadataRoute.Sitemap = projectsData.map((project) => ({
    url: `${SITE_URL}/projetos/${encodeURIComponent(project.id)}`,
    lastModified: now,
    changeFrequency: "yearly" as const,
    priority: 0.5,
  }));

  const blogEntries = await fetchBlogEntries(now);

  return [...staticEntries, ...projectEntries, ...blogEntries];
}
