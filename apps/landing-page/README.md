# Landing page — RLP Engenharia

Site institucional ([rlpeng.com.br](https://rlpeng.com.br)) em Next.js (App Router), Tailwind e Sanity, publicado na Vercel.

## Rodar localmente

```bash
pnpm install          # na raiz do monorepo
pnpm --filter rlp dev # http://localhost:3000 (usa `doppler run`)
```

`pnpm --filter rlp lint` e `pnpm --filter rlp check-types` rodam o ESLint e o typecheck.

## Blog

O blog (`/blog`) tem **duas fontes de artigos**, mescladas em `src/lib/blog/index.ts`:

1. **Artigos locais**, versionados em `src/lib/blog/posts/` — escritos em Markdown (subconjunto: `##`, `###`, listas, citações, negrito, itálico e links) e convertidos para Portable Text por `src/lib/blog/portable-text.ts`. São o que garante o blog no ar mesmo sem acesso ao Sanity.
2. **Sanity** (projeto `eharrlqv`, dataset `production`, configurado em `src/sanity/client.ts`) — artigos criados no Studio. Quando o mesmo slug existe nos dois lugares, o documento do Sanity prevalece (mantendo a capa local se ele não tiver imagem). Se a API do Sanity estiver fora do ar, o site segue só com os posts locais.

Categorias (`src/lib/blog/types.ts`): `guia-pratico` (síndicos e gestores) e `para-construtoras` (conteúdo técnico). A listagem aceita `?categoria=<slug>`.

### Criar um artigo novo

Copie um arquivo de `src/lib/blog/posts/`, ajuste `slug`, `title`, `publishedAt` (ISO com fuso), `excerpt`, `category`, `cover` (imagem em `public/`) e `body`, e registre-o em `src/lib/blog/posts/index.ts`. Posts com `publishedAt` no futuro só aparecem a partir da data.

### Levar os artigos locais para o Sanity

```bash
cd apps/landing-page
pnpm blog:seed -- --dry-run                  # lista o que seria enviado
SANITY_WRITE_TOKEN=... pnpm blog:seed        # cria/atualiza categorias e posts
pnpm blog:seed -- --ndjson blog.ndjson       # alternativa: arquivo p/ `sanity dataset import`
```

O token (permissão *Editor*) é gerado em <https://www.sanity.io/manage/project/eharrlqv> → API → Tokens. A importação é idempotente (IDs `post-<slug>` e `category-<slug>`). Depois de importados, os artigos podem ser editados no Studio e passam a prevalecer sobre a versão local.

As consultas GROQ usadas pelo site estão documentadas em `GROQ_QUERIES.md`.

## SEO

- **Domínio canônico**: `https://www.rlpeng.com.br` (o apex redireciona para o `www` na Vercel). Está centralizado em `src/lib/site.ts` (`SITE_URL`, sobrescrevível por `NEXT_PUBLIC_SITE_URL`), junto com telefone, endereço, redes sociais e a imagem padrão de compartilhamento (`public/og-image.jpg`, 1200×630).
- **Metadata por página**: o `layout.tsx` define o título padrão e o template `%s | RLP Engenharia`; cada `page.tsx` exporta `metadata` (ou `generateMetadata`) com `title`, `description`, `alternates.canonical` e Open Graph via `pageOpenGraph()` (`src/lib/seo.ts`). Páginas com filtros na URL (`/projetos?…`, `/blog?categoria=…`) apontam o canonical para a URL limpa.
- **robots.txt** (`src/app/robots.ts`) e **sitemap.xml** (`src/app/sitemap.ts`, com páginas estáticas, projetos e posts).
- **Dados estruturados** (JSON-LD, `src/lib/seo.ts` + `<JsonLd />`): `HVACBusiness`/`WebSite` na home, `FAQPage` na home e em `/manutencao`, `ItemList` de `Service` em `/servicos`, `BreadcrumbList` nas páginas internas, `BlogPosting` nos posts e `CreativeWork` nos projetos.
- **Projetos**: `src/lib/projects.ts` remove referências a fotos que não existem em `public/` (vários projetos de `project-data.ts` não têm imagem), evitando imagens quebradas e `og:image` 404. A lista `/projetos` é renderizada no servidor (`force-dynamic`) para o HTML já sair com os projetos.
- **Boas práticas**: um único `<h1>` por página, `alt` descritivo e `sizes` nas imagens `fill`, embed do Cal.com carregado só quando o visitante abre o menu flutuante.
- Depois de publicar: enviar o sitemap no Google Search Console (`https://www.rlpeng.com.br/sitemap.xml`) e validar os dados estruturados em <https://search.google.com/test/rich-results>.
