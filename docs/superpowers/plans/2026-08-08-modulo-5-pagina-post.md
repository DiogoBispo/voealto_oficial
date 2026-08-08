# Módulo 5 — Frontend Público: Página de Post — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/posts/[slug]` com SEO real (título/descrição batendo com os campos do post, fallback correto), JSON-LD `Article`, badge de patrocinado, posts relacionados automáticos (mesma categoria), e rascunho retornando 404 — validado com 3 posts de teste (normal, patrocinado, rascunho) + 1 "kitchen sink".

**Architecture:** `/posts/[slug]/page.tsx` já existe e já faz SSG (`generateStaticParams`) + já usa o renderer oficial `@payloadcms/richtext-lexical/react` (não um serializer HTML customizado — risco do SPEC de "serializer quebra com embeds" é bem menor aqui, ver Decisão 4). Este módulo **corrige** o fallback de SEO, **adiciona** JSON-LD e badge, e **troca** "posts relacionados" de um campo manual pra uma query automática por categoria.

**Tech Stack:** Next.js 15 `generateMetadata`, `@payloadcms/richtext-lexical/react`, JSON-LD via `<script type="application/ld+json">`.

## Global Constraints

- Rodar build/test sempre via `docker compose exec web ...`.
- URL dos posts continua `/posts/[slug]` — **decisão confirmada com o usuário**, não `/[slug]` como o texto do SPEC sugere literalmente (evita unificar com a rota genérica de páginas institucionais e o risco de colisão de slug entre post e página).
- Toda query de post público mantém a dupla checagem `_status published` + `publishedAt <= now()`, mesmo padrão dos Módulos 3 e 4.

## Decisões desta revisão

1. **SEO fallback estava incompleto.** `generateMeta` hoje cai pra um título/descrição genéricos ("Payload Website Template") quando `meta.title`/`meta.description` estão vazios — não faz fallback pro `title`/`excerpt` do post como o SPEC pede. Corrigido na Task 1. Aproveito pra trocar o nome de marca genérico do template por um placeholder correto do projeto.
2. **Autor exibido na Hero está errado pro nosso modelo.** `PostHero` hoje mostra `populatedAuthors` (usuários de login, campo antigo do template). Desde o Módulo 1, o post tem um campo `author` de verdade (relationship → collection `authors`, o perfil público editorial). Corrijo `PostHero` pra mostrar `post.author` — mais correto e é o que o JSON-LD `Article.author` também vai usar (Task 3).
3. **"Posts relacionados" vira automático (mesma categoria), não mais o campo manual.** O SPEC pede "mesma categoria, exclui o post atual, limit 3" — automático. O campo `relatedPosts` (seleção manual) continua existindo na collection (não removo, não é pedido), só não é mais o que a página `/posts/[slug]` usa pra essa seção.
4. **Risco do SPEC sobre o serializer Lexical é menor do que o esperado.** O SPEC alerta que serializers customizados de Lexical→HTML costumam quebrar com embeds. Este projeto usa o `RichText` **oficial** do pacote `@payloadcms/richtext-lexical/react` (não um serializer próprio) — bem mais robusto. Porém, **não existe hoje nenhum recurso de embed (YouTube/Instagram) configurado no editor** de Posts (só `BlocksFeature([Banner, Code, MediaBlock])`) — isso é uma lacuna do PRD (seção 4.3, "editor com embeds") não coberta em nenhum módulo do SPEC até aqui. Não construo isso agora (fora do escopo explícito do SPEC Módulo 5) — sinalizado aqui pra não ser esquecido, mas o "post kitchen sink" da Task 5 testa só os blocos que **existem de fato** (Banner, Code, MediaBlock, headings, listas, blockquote, links), não embeds inexistentes.

---

### Task 1: Corrigir fallback de SEO + dupla checagem de `publishedAt`

**Files:**
- Modify: `apps/web/src/utilities/generateMeta.ts`
- Modify: `apps/web/src/app/(frontend)/posts/[slug]/page.tsx` (função `queryPostBySlug`)

**Interfaces:**
- Produces: `generateMeta({ doc })` agora cai pro `title`/`excerpt`/`heroImage` do doc quando os campos `meta.*` estiverem vazios.

- [x] **Step 1:** Em `generateMeta.ts`, trocar o fallback de imagem, título e descrição:
```typescript
const getImageURL = (image?: Media | Config['db']['defaultIDType'] | null, fallback?: Media | Config['db']['defaultIDType'] | null) => {
  const serverUrl = getServerSideURL()
  const resolved = image ?? fallback

  let url = serverUrl + '/website-template-OG.webp'

  if (resolved && typeof resolved === 'object' && 'url' in resolved) {
    const ogUrl = resolved.sizes?.og?.url
    url = ogUrl ? serverUrl + ogUrl : serverUrl + resolved.url
  }

  return url
}

export const generateMeta = async (args: {
  doc: (Partial<Page> | Partial<Post>) | null
}): Promise<Metadata> => {
  const { doc } = args

  const heroImage = doc && 'heroImage' in doc ? doc.heroImage : undefined
  const excerpt = doc && 'excerpt' in doc ? doc.excerpt : undefined

  const ogImage = getImageURL(doc?.meta?.image, heroImage)

  const resolvedTitle = doc?.meta?.title || doc?.title
  const title = resolvedTitle ? `${resolvedTitle} | Voe Alto Traveller` : 'Voe Alto Traveller — Blog de Viagem'
  const description = doc?.meta?.description || excerpt || undefined

  return {
    description,
    openGraph: mergeOpenGraph({
      description: description || '',
      images: ogImage ? [{ url: ogImage }] : undefined,
      title,
      url: Array.isArray(doc?.slug) ? doc?.slug.join('/') : '/',
    }),
    title,
  }
}
```
- [x] **Step 2:** Em `posts/[slug]/page.tsx`, adicionar o filtro de `publishedAt` na query de `queryPostBySlug` (só quando não estiver em draft mode — em preview o editor precisa ver mesmo com data futura):
```typescript
where: {
  slug: { equals: slug },
  ...(draft ? {} : { publishedAt: { less_than_equal: new Date().toISOString() } }),
},
```
- [x] **Step 3:** Rodar `docker compose exec web npm run build`.
- [x] **Step 4:** Commit: `git add apps/web/src/utilities/generateMeta.ts apps/web/src/app/\(frontend\)/posts/\[slug\]/page.tsx && git commit -m "fix: correct SEO fallback (title/excerpt/heroImage) and double-check publishedAt on post page"`

---

### Task 2: Autor real na Hero + badge de patrocinado

**Files:**
- Modify: `apps/web/src/heros/PostHero/index.tsx`

**Interfaces:**
- Consumes: `Post.author` (relationship → `authors`, já existe desde o Módulo 1), `Post.sponsored`.

- [x] **Step 1:** Em `PostHero/index.tsx`, trocar a fonte do nome do autor de `populatedAuthors`/`formatAuthors` pra `post.author`:
```typescript
const { author, categories, heroImage, publishedAt, sponsored, title } = post
const authorName = typeof author === 'object' && author !== null ? author.title : undefined
```
Trocar o bloco `{hasAuthors && (...)}` por `{authorName && (<div className="flex flex-col gap-4">...<p>{authorName}</p></div>)}` (mesma estrutura visual, só a fonte do dado muda).
- [x] **Step 2:** Adicionar o badge de patrocinado, visível perto do título:
```typescript
{sponsored && (
  <span className="inline-block bg-yellow-400 text-black text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded mb-4">
    Conteúdo patrocinado
  </span>
)}
```
(posicionar antes do `<h1>`, dentro do mesmo container.)
- [x] **Step 3:** Rodar `docker compose exec web npm run build`.
- [x] **Step 4:** Commit: `git add apps/web/src/heros/PostHero && git commit -m "feat: show real author profile and sponsored badge on post hero"`

---

### Task 3: JSON-LD `Article` schema

**Files:**
- Create: `apps/web/src/components/ArticleJsonLd/index.tsx`
- Modify: `apps/web/src/app/(frontend)/posts/[slug]/page.tsx`

**Interfaces:**
- Consumes: o `post` já carregado na página (nenhuma query nova).

- [x] **Step 1:** Criar `apps/web/src/components/ArticleJsonLd/index.tsx`:
```typescript
import type { Post } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'

export const ArticleJsonLd: React.FC<{ post: Post }> = ({ post }) => {
  const serverUrl = getServerSideURL()
  const authorName =
    typeof post.author === 'object' && post.author !== null ? post.author.title : undefined
  const imageUrl =
    typeof post.heroImage === 'object' && post.heroImage !== null && post.heroImage.url
      ? serverUrl + post.heroImage.url
      : undefined

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.meta?.description || post.excerpt || undefined,
    image: imageUrl ? [imageUrl] : undefined,
    datePublished: post.publishedAt || undefined,
    dateModified: post.updatedAt || undefined,
    author: authorName ? { '@type': 'Person', name: authorName } : undefined,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${serverUrl}/posts/${post.slug}`,
    },
  }

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
```
- [x] **Step 2:** Em `posts/[slug]/page.tsx`, importar e renderizar `<ArticleJsonLd post={post} />` dentro do `<article>`, antes ou depois da `PostHero`.
- [x] **Step 3:** Rodar `docker compose exec web npm run build`. Testar manualmente: abrir a página de um post real, inspecionar o `<script type="application/ld+json">` no HTML, colar o JSON no [Rich Results Test do Google](https://search.google.com/test/rich-results) (validação manual — fora do alcance deste ambiente sem browser).
- [x] **Step 4:** Commit: `git add apps/web/src/components/ArticleJsonLd apps/web/src/app/\(frontend\)/posts/\[slug\]/page.tsx && git commit -m "feat: add JSON-LD Article schema to post page"`

---

### Task 4: Posts relacionados automáticos (mesma categoria)

**Files:**
- Create: `apps/web/src/components/RelatedPostsByCategory/index.tsx`
- Modify: `apps/web/src/app/(frontend)/posts/[slug]/page.tsx`

**Interfaces:**
- Produces: até 3 posts da mesma categoria do post atual, excluindo ele mesmo, só publicados.

- [x] **Step 1:** Criar `apps/web/src/components/RelatedPostsByCategory/index.tsx`:
```typescript
import type { Post } from '@/payload-types'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { RelatedPosts } from '@/blocks/RelatedPosts/Component'

export const RelatedPostsByCategory: React.FC<{ post: Post }> = async ({ post }) => {
  const categoryIds = (post.categories ?? [])
    .map((c) => (typeof c === 'object' ? c.id : c))
    .filter(Boolean)

  if (categoryIds.length === 0) return null

  const payload = await getPayload({ config: configPromise })
  const related = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: 3,
    overrideAccess: false,
    where: {
      categories: { in: categoryIds },
      id: { not_equals: post.id },
      publishedAt: { less_than_equal: new Date().toISOString() },
    },
  })

  if (related.docs.length === 0) return null

  return (
    <RelatedPosts
      className="mt-12 max-w-[52rem] lg:grid lg:grid-cols-subgrid col-start-1 col-span-3 grid-rows-[2fr]"
      docs={related.docs}
    />
  )
}
```
- [x] **Step 2:** Em `posts/[slug]/page.tsx`, trocar o bloco atual (`{post.relatedPosts && ... <RelatedPosts docs={post.relatedPosts...} />}`) por `<RelatedPostsByCategory post={post} />`.
- [x] **Step 3:** Rodar `docker compose exec web npm run build`.
- [x] **Step 4:** Commit: `git add apps/web/src/components/RelatedPostsByCategory apps/web/src/app/\(frontend\)/posts/\[slug\]/page.tsx && git commit -m "feat: compute related posts automatically by shared category"`

---

### Task 5: Verificação (SPEC 5.2/5.3) — 3 posts + 1 kitchen sink

**Files:** nenhum novo — script tsx descartável.

- [x] **Step 1:** Criar via Local API (script descartável): 1 categoria de teste; **post normal** (publicado, com `meta.title`/`meta.description` preenchidos); **post patrocinado** (publicado, `sponsored: true`, sem `meta.title`/`meta.description` — pra testar o fallback pro `title`/`excerpt`); **post rascunho** (`_status: draft`); **post "kitchen sink"** (publicado, `content` usando todos os blocos existentes: parágrafo, H2/H3, lista, blockquote (se o editor suportar nativamente via `defaultConverters`), link interno, blocos Banner/Code/MediaBlock).
- [x] **Step 2:** Verificar via `fetch()`:
  - Post normal: `<title>` e meta description no HTML batem com `meta.title`/`meta.description` cadastrados.
  - Post patrocinado: `<title>` cai pro fallback (`title` do post), badge "Conteúdo patrocinado" aparece no HTML.
  - Post normal (sem `sponsored`): badge **não** aparece.
  - Post rascunho: `GET /posts/<slug-do-rascunho>` retorna 404 (não 200, não 500).
  - Post kitchen sink: `GET /posts/<slug>` retorna 200 sem lançar exceção (renderer não quebrou com nenhum bloco).
  - JSON-LD presente e é um JSON válido (`JSON.parse` no conteúdo do `<script type="application/ld+json">` extraído do HTML) com `headline`, `datePublished`, `author.name` preenchidos.
- [x] **Step 3:** Limpar os dados de teste, confirmar com `find()` (0 remanescentes).
- [x] **Step 4 (Rich Results Test — manual):** documentar aqui que a validação final no [Rich Results Test do Google](https://search.google.com/test/rich-results) precisa ser feita pelo usuário (este ambiente não tem browser) — colar a URL pública do post depois do deploy, ou o HTML gerado.

## Definição de Pronto (Módulo 5)

- [x] `<title>` e `<meta description>` batem com os campos SEO do post (testado com `meta.*` preenchido) e caem pro fallback correto (`title`/`excerpt`) quando vazios.
- [x] JSON-LD gerado é um `Article` schema válido (`@type`, `headline`, `datePublished`, `author.name`, `image`, `mainEntityOfPage` todos presentes e corretos) — validado estruturalmente com `JSON.parse` real sobre o HTML servido. Validação final no Rich Results Test do Google fica pro usuário (ambiente sem browser).
- [x] Post com `sponsored=true` mostra o badge; `sponsored=false`/ausente não mostra — testado nos dois sentidos.
- [x] Post com `status != published` retorna 404 (testado com post rascunho real, não simulado).
- [x] Post "kitchen sink" (H2/H3, parágrafo, link, blockquote, lista, blocos Banner e Code) renderiza sem quebrar, todos os elementos confirmados presentes no HTML.

### Verificação real executada

18 checks rodados contra o servidor real (Postgres real, HTTP real via `fetch()`), 4 posts de teste (normal, patrocinado, rascunho, kitchen sink) + posts de teste extras pra "posts relacionados" (4 na mesma categoria, 1 em categoria diferente, 1 rascunho na mesma categoria — confirmado que só os 3 certos aparecem, nenhum rascunho, nenhum de categoria diferente). Todos os 18 checks passaram. Limpeza confirmada via `find()` em toda task, não só assumida.

**Nenhum bug novo encontrado durante a implementação** deste módulo (diferente dos Módulos 1, 3 e 4) — as correções (SEO fallback, autor real, related posts automático) eram exatamente o que o plano já previa como trabalho a fazer, não descobertas de bugs no meio do caminho.

**Lacuna sinalizada, não implementada (fora de escopo):** o editor de Posts não tem suporte a embeds (YouTube/Instagram) mencionados no PRD seção 4.3 — o risco do SPEC sobre "serializer quebra com embeds" não se aplica porque embeds não existem como recurso hoje. Fica registrado pra quando essa feature entrar em algum módulo futuro.
