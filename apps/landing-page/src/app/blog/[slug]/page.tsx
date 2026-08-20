import { PortableText } from "@portabletext/react";
import { type SanityDocument } from "next-sanity";
import { createImageUrlBuilder } from "@sanity/image-url";
import type { SanityImageSource } from "@sanity/image-url";
import { client } from "@/sanity/client";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Calendar, ArrowLeft, Tag } from "lucide-react";

const POST_QUERY = `*[_type == "post" && slug.current == $slug][0]{
  _id,
  title,
  slug,
  publishedAt,
  excerpt,
  image,
  body,
  category->{
    _id,
    title,
    slug
  }
}`;

const { projectId, dataset } = client.config();
const urlFor = (source: SanityImageSource) =>
  projectId && dataset
    ? createImageUrlBuilder({ projectId, dataset }).image(source)
    : null;

const options = { next: { revalidate: 30 } };

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await client.fetch<SanityDocument | null>(
    POST_QUERY,
    { slug },
    options
  );

  if (!post) {
    notFound();
  }

  const postImageUrl = post.image
    ? urlFor(post.image)?.width(1200).height(600).url()
    : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero with Image */}
      <section className="relative">
        {/* Back Button - Floating */}
        <div className="absolute top-6 left-6 z-20">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm text-gray-700 rounded-full shadow-lg hover:bg-white hover:shadow-xl transition-all group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-sm font-medium">Voltar</span>
          </Link>
        </div>

        {/* Hero Image */}
        <div className="relative h-[40vh] md:h-[50vh] lg:h-[60vh] bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 overflow-hidden">
          {postImageUrl ? (
            <>
              <Image
                src={postImageUrl}
                alt={post.title}
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            </>
          ) : (
            <>
              {/* Decorative elements for no-image state */}
              <div className="absolute inset-0 opacity-20">
                <div className="absolute top-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl" />
                <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-400 rounded-full blur-3xl" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-blue-900/90 to-transparent" />
            </>
          )}

          {/* Title Overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12">
            <div className="max-w-4xl mx-auto">
              {/* Category */}
              {post.category && (
                <div className="flex items-center gap-2 mb-4">
                  <Tag className="w-4 h-4 text-blue-300" />
                  <span className="text-blue-200 text-sm font-medium">
                    {post.category.title}
                  </span>
                </div>
              )}

              {/* Title */}
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 font-serif leading-tight">
                {post.title}
              </h1>

              {/* Date */}
              <div className="flex items-center gap-2 text-white/80">
                <Calendar className="w-4 h-4" />
                <time dateTime={post.publishedAt} className="text-sm">
                  {new Date(post.publishedAt).toLocaleDateString("pt-BR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-12 md:py-16 px-6 md:px-12">
        <article className="max-w-3xl mx-auto">
          {/* Excerpt */}
          {post.excerpt && (
            <p className="text-xl text-gray-600 leading-relaxed mb-8 pb-8 border-b border-gray-200 font-medium">
              {post.excerpt}
            </p>
          )}

          {/* Body Content */}
          {Array.isArray(post.body) && (
            <div className="prose prose-lg prose-slate max-w-none prose-headings:font-serif prose-headings:text-gray-900 prose-p:text-gray-600 prose-p:leading-relaxed prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-900 prose-img:rounded-xl prose-img:shadow-lg prose-blockquote:border-l-blue-600 prose-blockquote:bg-blue-50 prose-blockquote:py-1 prose-blockquote:rounded-r-lg">
              <PortableText value={post.body} />
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 pt-8 border-t border-gray-200">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              Ver todos os posts
            </Link>
          </div>
        </article>
      </section>
    </main>
  );
}
