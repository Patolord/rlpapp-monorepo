import type { MetadataRoute } from "next";
import { projectsData } from "@/data/project-data";
import { getAllPosts } from "@/lib/blog";

const SITE_URL = "https://rlpeng.com.br";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/sobre`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/servicos`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/manutencao`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/projetos`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/carreiras`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 },
  ];

  const projectRoutes: MetadataRoute.Sitemap = projectsData.map((project) => ({
    url: `${SITE_URL}/projetos/${project.id}`,
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.publishedAt),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...projectRoutes, ...postRoutes];
}
