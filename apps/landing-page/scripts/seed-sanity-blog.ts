/**
 * Publica no Sanity os artigos locais do blog (src/lib/blog/posts).
 *
 * Uso (a partir de apps/landing-page):
 *   SANITY_WRITE_TOKEN=... pnpm blog:seed            # cria/atualiza no dataset
 *   pnpm blog:seed -- --dry-run                      # só mostra o que seria enviado
 *   pnpm blog:seed -- --ndjson blog.ndjson           # gera arquivo p/ `sanity dataset import`
 *
 * O token precisa ter permissão de escrita (Editor) no projeto `eharrlqv`:
 * https://www.sanity.io/manage/project/eharrlqv → API → Tokens.
 *
 * A operação é idempotente: os documentos usam IDs determinísticos
 * (`post-<slug>` e `category-<slug>`) e são criados ou substituídos.
 * A imagem de capa não é enviada (o site continua usando a capa local
 * enquanto o documento no Sanity não tiver imagem).
 */
import { writeFileSync } from "node:fs";
import { createClient } from "next-sanity";
import { client as siteClient } from "../src/sanity/client";
import { localPosts } from "../src/lib/blog/posts";
import { BLOG_CATEGORIES } from "../src/lib/blog/types";

type SanityDoc = Record<string, unknown> & { _id: string; _type: string };

function buildDocuments(): SanityDoc[] {
  const categories: SanityDoc[] = Object.values(BLOG_CATEGORIES).map((category) => ({
    _id: `category-${category.slug}`,
    _type: "category",
    title: category.title,
    slug: { _type: "slug", current: category.slug },
    description: category.description,
  }));

  const posts: SanityDoc[] = localPosts.map((post) => ({
    _id: `post-${post.slug}`,
    _type: "post",
    title: post.title,
    slug: { _type: "slug", current: post.slug },
    publishedAt: new Date(post.publishedAt).toISOString(),
    excerpt: post.excerpt,
    category: { _type: "reference", _ref: `category-${post.category}` },
    body: post.blocks,
  }));

  return [...categories, ...posts];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const ndjsonIndex = args.indexOf("--ndjson");
  const ndjsonPath = ndjsonIndex >= 0 ? args[ndjsonIndex + 1] : null;

  const documents = buildDocuments();
  const { projectId, dataset } = siteClient.config();

  if (ndjsonPath) {
    writeFileSync(ndjsonPath, documents.map((doc) => JSON.stringify(doc)).join("\n") + "\n");
    console.log(`${documents.length} documentos escritos em ${ndjsonPath}`);
    console.log(`Importe com: npx sanity dataset import ${ndjsonPath} ${dataset} --replace`);
    return;
  }

  if (dryRun) {
    for (const doc of documents) {
      console.log(`${doc._type.padEnd(8)} ${doc._id}`);
    }
    console.log(`\n${documents.length} documentos (dry run — nada foi enviado).`);
    return;
  }

  const token = process.env.SANITY_WRITE_TOKEN ?? process.env.SANITY_API_TOKEN;
  if (!token) {
    console.error(
      "Defina SANITY_WRITE_TOKEN com um token de escrita (Editor) do projeto " +
        `${projectId}: https://www.sanity.io/manage/project/${projectId} → API → Tokens`
    );
    process.exit(1);
  }

  const client = createClient({
    projectId,
    dataset,
    apiVersion: "2024-01-01",
    useCdn: false,
    token,
  });

  let transaction = client.transaction();
  for (const doc of documents) {
    transaction = transaction.createOrReplace(doc);
  }
  const result = await transaction.commit();

  console.log(
    `Publicados ${documents.length} documentos no dataset "${dataset}" (transação ${result.transactionId}).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
