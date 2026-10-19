import type { Metadata } from "next";
import { PortableText } from "@portabletext/react";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Calendar, ArrowLeft, ArrowRight, Tag, Clock } from "lucide-react";
import {
  formatPostDate,
  getPostBySlug,
  getRelatedPosts,
  postImageAlt,
  postImageUrl,
} from "@/lib/blog";

const SITE_URL = "https://rlpeng.com.br";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) {
    return { title: "Post não encontrado | RLP Engenharia" };
  }

  const imageUrl = postImageUrl(post, 1200, 630);

  return {
    title: `${post.title} | Blog RLP Engenharia`,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt,
      authors: ["RLP Engenharia"],
      ...(imageUrl ? { images: [{ url: imageUrl, width: 1200, height: 630, alt: postImageAlt(post) }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const heroImageUrl = postImageUrl(post, 1600, 900);
  const related = await getRelatedPosts(post, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    inLanguage: "pt-BR",
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    ...(heroImageUrl
      ? { image: heroImageUrl.startsWith("http") ? heroImageUrl : `${SITE_URL}${heroImageUrl}` }
      : {}),
    author: { "@type": "Organization", name: "RLP Engenharia", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "RLP Engenharia",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logorlp.png` },
    },
    ...(post.category ? { articleSection: post.category.title } : {}),
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <section className="relative">
        <div className="absolute top-6 left-6 z-20">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm text-gray-700 rounded-full shadow-lg hover:bg-white hover:shadow-xl transition-all group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Voltar</span>
          </Link>
        </div>

        <div className="relative h-[40vh] md:h-[50vh] lg:h-[60vh] bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 overflow-hidden">
          {heroImageUrl ? (
            <>
              <Image
                src={heroImageUrl}
                alt={postImageAlt(post)}
                fill
                sizes="100vw"
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            </>
          ) : (
            <>
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
                <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-400 rounded-full blur-3xl" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-blue-900/90 to-transparent" />
            </>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12">
            <div className="max-w-4xl mx-auto">
              {post.category && (
                <Link
                  href={`/blog?categoria=${post.category.slug}`}
                  className="inline-flex items-center gap-2 mb-4 text-blue-200 hover:text-white transition-colors"
                >
                  <Tag className="w-4 h-4 text-blue-300" aria-hidden="true" />
                  <span className="text-sm font-medium">{post.category.title}</span>
                </Link>
              )}

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 font-serif leading-tight">
                {post.title}
              </h1>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-white/80 text-sm">
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" aria-hidden="true" />
                  <time dateTime={post.publishedAt}>{formatPostDate(post.publishedAt)}</time>
                </span>
                {post.readingMinutes && (
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4" aria-hidden="true" />
                    {post.readingMinutes} min de leitura
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-12 md:py-16 px-6 md:px-12">
        <article className="max-w-3xl mx-auto">
          {post.excerpt && (
            <p className="text-xl text-gray-600 leading-relaxed mb-8 pb-8 border-b border-gray-200 font-medium">
              {post.excerpt}
            </p>
          )}

          {Array.isArray(post.body) && (
            <div className="prose prose-lg prose-slate max-w-none prose-headings:font-serif prose-headings:text-gray-900 prose-p:text-gray-600 prose-p:leading-relaxed prose-li:text-gray-600 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-img:rounded-xl prose-img:shadow-lg prose-blockquote:border-l-blue-600 prose-blockquote:bg-blue-50 prose-blockquote:py-1 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:font-normal">
              <PortableText value={post.body} />
            </div>
          )}

          <div className="mt-12 pt-8 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center gap-4">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Ver todos os posts
            </Link>
            <Link
              href="https://wa.me/5511985782307?text=Olá,%20li%20um%20artigo%20no%20blog%20e%20gostaria%20de%20solicitar%20um%20orçamento"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 border border-blue-600 text-blue-600 rounded-full font-medium hover:bg-blue-50 transition-colors"
            >
              Falar com a RLP
            </Link>
          </div>
        </article>
      </section>

      {/* Leia também */}
      {related.length > 0 && (
        <section className="pb-16 px-6 md:px-12">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-serif text-blue-950 mb-8">
              Leia também
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {related.map((item) => {
                const imageUrl = postImageUrl(item, 600, 400);
                return (
                  <Link
                    key={item._id}
                    href={`/blog/${item.slug}`}
                    className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100 flex flex-col"
                  >
                    <div className="relative h-40 bg-gradient-to-br from-blue-100 to-blue-50 overflow-hidden">
                      {imageUrl && (
                        <Image
                          src={imageUrl}
                          alt={postImageAlt(item)}
                          fill
                          sizes="(min-width: 768px) 33vw, 100vw"
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      )}
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      {item.category && (
                        <span className="text-xs font-medium text-blue-600 mb-2">
                          {item.category.title}
                        </span>
                      )}
                      <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                        {item.title}
                      </h3>
                      <span className="inline-flex items-center gap-1 text-blue-600 text-sm font-medium mt-auto pt-4">
                        Ler
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
