import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Calendar, ArrowRight, Clock } from "lucide-react";
import JsonLd from "@/components/JsonLd";
import { breadcrumbJsonLd, jsonLdGraph, pageOpenGraph } from "@/lib/seo";
import {
  BLOG_CATEGORIES,
  formatPostDate,
  getAllPosts,
  postImageAlt,
  postImageUrl,
  type BlogPost,
} from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog: HVAC, pressurização, AVCB e manutenção",
  description:
    "Guias práticos para síndicos e gestores e conteúdo técnico para construtoras sobre climatização, ventilação, pressurização de escadas, detecção de incêndio, PMOC e AVCB.",
  alternates: { canonical: "/blog" },
  openGraph: pageOpenGraph({
    title: "Blog RLP Engenharia: HVAC, pressurização, AVCB e manutenção",
    description:
      "Climatização, proteção contra incêndio e manutenção predial: guias para quem opera e conteúdo técnico para quem constrói.",
    url: "/blog",
    type: "website",
  }),
};

const FILTERS = [
  { slug: "", label: "Todos" },
  ...Object.values(BLOG_CATEGORIES).map((category) => ({
    slug: category.slug,
    label: category.title,
  })),
];

function categoryBadgeClass(slug: string | undefined): string {
  return slug === "para-construtoras"
    ? "bg-blue-600 text-white"
    : "bg-emerald-600 text-white";
}

function PostCard({ post, index }: { post: BlogPost; index: number }) {
  const imageUrl = postImageUrl(post, 600, 400);

  return (
    <article
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <Link
        href={`/blog/${post.slug}`}
        className="relative block h-52 overflow-hidden bg-gradient-to-br from-blue-100 to-blue-50"
        aria-label={post.title}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={postImageAlt(post)}
            fill
            sizes="(min-width: 1024px) 384px, (min-width: 768px) 50vw, 100vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg
              className="w-16 h-16 text-blue-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}

        {post.category && (
          <span
            className={`absolute top-4 left-4 px-3 py-1 text-xs font-medium rounded-full shadow-lg ${categoryBadgeClass(post.category.slug)}`}
          >
            {post.category.title}
          </span>
        )}
      </Link>

      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-center gap-4 text-gray-400 text-sm mb-3">
          <span className="flex items-center gap-2">
            <Calendar className="w-4 h-4" aria-hidden="true" />
            <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
          </span>
          {post.readingMinutes && (
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" aria-hidden="true" />
              {post.readingMinutes} min
            </span>
          )}
        </div>

        <h2 className="text-xl font-semibold text-gray-900 mb-3 line-clamp-2 group-hover:text-blue-600 transition-colors">
          <Link href={`/blog/${post.slug}`}>{post.title}</Link>
        </h2>

        {post.excerpt && (
          <p className="text-gray-500 text-sm leading-relaxed line-clamp-3 mb-4 flex-1">
            {post.excerpt}
          </p>
        )}

        <Link
          href={`/blog/${post.slug}`}
          className="inline-flex items-center gap-2 text-blue-600 font-medium text-sm group/link mt-auto"
        >
          Ler mais
          <ArrowRight className="w-4 h-4 group-hover/link:translate-x-1 transition-transform" />
        </Link>
      </div>
    </article>
  );
}

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string | string[] }>;
}) {
  const { categoria } = await searchParams;
  const requested = Array.isArray(categoria) ? categoria[0] : categoria;
  const activeCategory =
    requested && requested in BLOG_CATEGORIES ? requested : "";

  const posts = await getAllPosts({ category: activeCategory || null });

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <JsonLd
        data={jsonLdGraph(
          breadcrumbJsonLd([
            { name: "Início", path: "/" },
            { name: "Blog", path: "/blog" },
          ])
        )}
      />
      {/* Hero Section */}
      <section className="relative py-20 px-6 md:px-12 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-400 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <span className="inline-block px-4 py-1.5 bg-blue-500/30 text-blue-100 text-sm font-medium rounded-full mb-4 backdrop-blur-sm border border-blue-400/20">
            Blog & Notícias
          </span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 font-serif">
            Blog RLP Engenharia
          </h1>
          <p className="text-blue-100 text-lg md:text-xl max-w-2xl leading-relaxed">
            Guias práticos para quem cuida de um prédio e conteúdo técnico para
            quem constrói: climatização, ventilação, pressurização de escadas,
            detecção de incêndio, PMOC e AVCB.
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="py-12 md:py-16 px-6 md:px-12">
        <div className="max-w-6xl mx-auto">
          <nav
            aria-label="Filtrar por público"
            className="flex flex-wrap gap-3 mb-10"
          >
            {FILTERS.map((filter) => {
              const isActive = filter.slug === activeCategory;
              return (
                <Link
                  key={filter.slug || "todos"}
                  href={filter.slug ? `/blog?categoria=${filter.slug}` : "/blog"}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "px-4 py-1.5 text-sm rounded-full bg-blue-900 text-white border border-blue-900"
                      : "px-4 py-1.5 text-sm rounded-full bg-white text-blue-950 border border-blue-900 hover:bg-blue-700 hover:text-white hover:border-blue-700 transition"
                  }
                >
                  {filter.label}
                </Link>
              );
            })}
          </nav>

          {posts.length === 0 ? (
            <div className="text-center py-20">
              <h2 className="text-2xl font-semibold text-gray-800 mb-2">
                Nenhum post encontrado
              </h2>
              <p className="text-gray-500">Em breve teremos novidades por aqui!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {posts.map((post, index) => (
                <PostCard key={post._id} post={post} index={index} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
