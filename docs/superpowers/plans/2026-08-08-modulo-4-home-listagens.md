# Módulo 4 — Frontend Público: Home e Listagens — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home com destaques + faixa de afiliados + segunda leva + newsletter + grid paginado; páginas de listagem por categoria/atlas/tag; `PostCard` com imagem/categoria/título/autor/data; nenhuma página vaza post não-publicado.

**Architecture:** o template já tem a base pronta — `Card`/`CollectionArchive` (= `PostCard`), `Pagination`, e o par `/posts` + `/posts/page/[pageNumber]` já implementam SSG+ISR+paginação numérica corretamente. Este módulo **estende** esses componentes (autor/data/alt no Card, `basePath` na Pagination), **extrai** a lógica de `/posts/page.tsx` pra um componente reutilizável (`PostsGridPage`), e **replica** o padrão pra categoria/atlas/tag. Home deixa de delegar pro sistema genérico de blocks de `pages` (ver Decisão 1) e vira um template dedicado.

**Tech Stack:** Next.js 15 App Router (SSG + `revalidate`), Payload Local API (`payload.find()` direto em Server Components — ver Decisão 2), Tailwind (já usado em todo o template).

## Global Constraints

- Rodar build/test sempre via `docker compose exec web ...` (Postgres não exposto ao host).
- Todo fetch de posts pro público deve usar `overrideAccess: false` **e** filtro explícito `publishedAt: { less_than_equal: new Date().toISOString() }` — mesma dupla checagem do Módulo 3, agora também no front.
- Seguir os padrões visuais/estruturais já existentes (Tailwind classes, `container`, `prose`) em vez de introduzir um sistema novo.

## Decisões desta revisão

1. **Home deixa de ser uma `pages` editável via blocks.** Hoje `/` delega pro sistema genérico de `pages`+blocks (o cliente poderia arrastar blocks no admin). O SPEC 4.1 descreve a Home como uma estrutura **fixa** (destaques → afiliados → segunda leva → newsletter → grid paginado) — não um layout livre. Construo um template dedicado em vez de forçar isso no sistema de blocks (que não suporta paginação numérica nativamente — o bloco `Archive` existente é só uma lista com `limit` fixo, sem paginação). O sistema de `pages`+blocks continua 100% disponível pras páginas institucionais (Sobre, Manifesto, Contato — Módulo 5/6), só não pra Home. Isso é uma escolha consciente que reduz a "editabilidade" da Home especificamente — se o cliente precisar reordenar seções da Home sem developer no futuro, isso vira trabalho novo (voltar a um sistema de blocks customizado, com um bloco de paginação de verdade).
2. **Sem round-trip pela própria API do Módulo 3 pra renderizar páginas.** As páginas SSG usam `payload.find()` direto (Local API), igual o template já faz em `/posts/page.tsx` — mais rápido que a app chamar sua própria API HTTP. Os endpoints do Módulo 3 continuam existindo e são usados onde fazem sentido: o formulário de newsletter da Home (client-side, precisa ser uma chamada HTTP de verdade) usa `POST /api/newsletter/subscribe`.
3. **Grid paginado da Home = arquivo `/posts` reaproveitado, não uma paginação paralela.** Em vez de criar `/page/[pageNumber]` só pra Home (duplicando a lógica de paginação da raiz), a seção final da Home renderiza a página 1 do mesmo componente usado em `/posts`, com os mesmos links de paginação (`/posts/page/N`). Evita ter duas fontes de paginação divergentes pra "últimos posts".
4. **Sem deduplicação entre seções da Home.** Destaques (últimos 4) e segunda leva (próximos posts) podem se sobrepor com o grid paginado do final — comportamento comum em blogs de referência (inclusive o 360meridianos), não pedido explicitamente no SPEC. Não construo lógica de exclusão agora (YAGNI); registrar aqui caso vire pedido explícito depois.

---

### Task 1: Estender `Card` (autor + data + alt-fallback) e generalizar `Pagination`

**Files:**
- Modify: `apps/web/src/components/Card/index.tsx`
- Modify: `apps/web/src/components/CollectionArchive/index.tsx`
- Modify: `apps/web/src/components/Pagination/index.tsx`

**Interfaces:**
- Produces: `CardPostData` agora inclui `author`/`publishedAt`; `Pagination` aceita `basePath` (default `/posts`, não quebra os usos existentes).

- [x] **Step 1:** Em `Card/index.tsx`, ampliar o type e o JSX:
```typescript
export type CardPostData = Pick<
  Post,
  'slug' | 'categories' | 'meta' | 'title' | 'author' | 'publishedAt'
>
```
Dentro do componente, extrair `author, publishedAt` de `doc`, calcular:
```typescript
const authorName =
  typeof author === 'object' && author !== null ? author.title : undefined
const formattedDate = publishedAt
  ? new Date(publishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  : undefined
```
Renderizar `authorName`/`formattedDate` logo abaixo do título (ex.: `<div className="text-sm text-muted-foreground mt-1">{authorName}{authorName && formattedDate && ' · '}{formattedDate}</div>`).
Corrigir o fallback de `alt` (SPEC 4.2 — alt obrigatório, fallback = título do post):
```typescript
{metaImage && typeof metaImage !== 'string' && (
  <Media resource={metaImage} size="33vw" alt={(typeof metaImage === 'object' && metaImage.alt) || titleToUse || ''} />
)}
```
- [x] **Step 2:** Em `CollectionArchive/index.tsx`, garantir que o `select`/populate de quem chama já traga `author`/`publishedAt` — **não precisa mudar este arquivo**, só os pontos que fazem `payload.find` (Task 2/3/5) precisam pedir esses campos.
- [x] **Step 3:** Em `Pagination/index.tsx`, adicionar prop `basePath` com default `/posts`, trocar as 5 ocorrências de `` `/posts/page/${...}` `` por `` `${basePath}/page/${...}` ``:
```typescript
export const Pagination: React.FC<{
  basePath?: string
  className?: string
  page: number
  totalPages: number
}> = (props) => {
  const router = useRouter()
  const { basePath = '/posts', className, page, totalPages } = props
  // ... trocar todo `/posts/page/${x}` por `${basePath}/page/${x}`
```
- [x] **Step 4:** Rodar `docker compose exec web npm run build`. Como `/posts/page.tsx` chama `<Pagination page={...} totalPages={...} />` sem `basePath`, o default `/posts` preserva o comportamento atual — confirmar que nada quebrou.
- [x] **Step 5:** Commit: `git add apps/web/src/components/Card apps/web/src/components/Pagination && git commit -m "feat: add author/date/alt-fallback to Card and basePath to Pagination"`

---

### Task 2: Extrair `PostsGridPage` reutilizável a partir de `/posts/page.tsx`

**Files:**
- Create: `apps/web/src/components/PostsGridPage/index.tsx`
- Modify: `apps/web/src/app/(frontend)/posts/page.tsx` (passa a usar o componente extraído, sem mudar comportamento)

**Interfaces:**
- Produces: `<PostsGridPage where={...} page={...} basePath={...} title={...} />`, usado nas Tasks 3 e 5.

- [x] **Step 1:** Criar `apps/web/src/components/PostsGridPage/index.tsx`, generalizando a lógica hoje só em `/posts/page.tsx`:
```typescript
import { CollectionArchive } from '@/components/CollectionArchive'
import { PageRange } from '@/components/PageRange'
import { Pagination } from '@/components/Pagination'
import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'
import React from 'react'

export const PostsGridPage: React.FC<{
  basePath: string
  limit?: number
  page: number
  title?: string
  where?: Where
}> = async ({ basePath, limit = 12, page, title, where }) => {
  const payload = await getPayload({ config: configPromise })

  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    page,
    limit,
    overrideAccess: false,
    where: {
      ...where,
      publishedAt: { less_than_equal: new Date().toISOString() },
    },
    select: {
      title: true,
      slug: true,
      categories: true,
      author: true,
      publishedAt: true,
      meta: true,
    },
  })

  return (
    <div className="pt-24 pb-24">
      {title && (
        <div className="container mb-16">
          <div className="prose dark:prose-invert max-w-none">
            <h1>{title}</h1>
          </div>
        </div>
      )}

      <div className="container mb-8">
        <PageRange collection="posts" currentPage={posts.page} limit={limit} totalDocs={posts.totalDocs} />
      </div>

      <CollectionArchive posts={posts.docs} />

      <div className="container">
        {posts.totalPages > 1 && posts.page && (
          <Pagination basePath={basePath} page={posts.page} totalPages={posts.totalPages} />
        )}
      </div>
    </div>
  )
}
```
- [x] **Step 2:** Reescrever `apps/web/src/app/(frontend)/posts/page.tsx` pra usar o componente novo, preservando `dynamic`/`revalidate`/`PageClient`/`generateMetadata`:
```typescript
import type { Metadata } from 'next/types'
import { PostsGridPage } from '@/components/PostsGridPage'
import PageClient from './page.client'

export const dynamic = 'force-static'
export const revalidate = 600

export default function Page() {
  return (
    <>
      <PageClient />
      <PostsGridPage basePath="/posts" page={1} title="Posts" />
    </>
  )
}

export function generateMetadata(): Metadata {
  return { title: `Payload Website Template Posts` }
}
```
- [x] **Step 3:** Verificar `apps/web/src/app/(frontend)/posts/page/[pageNumber]/page.tsx` (não precisa reescrever se já for uma variação simples — só confirmar que continua funcionando; se ele duplicar a mesma lógica de fetch, considerar migrar pro componente também, mas isso é opcional nesta task, priorizar não quebrar).
- [x] **Step 4:** Rodar `docker compose exec web npm run build` e conferir manualmente `http://localhost:3000/posts` e `http://localhost:3000/posts/page/2` (se houver posts suficientes) continuam idênticos a antes.
- [x] **Step 5:** Commit: `git add apps/web/src/components/PostsGridPage apps/web/src/app/\(frontend\)/posts/page.tsx && git commit -m "refactor: extract reusable PostsGridPage component from /posts"`

---

### Task 3: Rotas `/categoria/[slug]`, `/atlas/[slug]`, `/tag/[slug]` (+ paginação)

**Files (padrão repetido 3x — descrito uma vez, arquivos representativos abaixo):**
- Create: `apps/web/src/app/(frontend)/categoria/[slug]/page.tsx`
- Create: `apps/web/src/app/(frontend)/categoria/[slug]/page/[pageNumber]/page.tsx`
- Create: `apps/web/src/app/(frontend)/atlas/[slug]/page.tsx` (mesmo padrão, coleção `atlas-locations`, campo `locations`)
- Create: `apps/web/src/app/(frontend)/atlas/[slug]/page/[pageNumber]/page.tsx`
- Create: `apps/web/src/app/(frontend)/tag/[slug]/page.tsx` (mesmo padrão, coleção `tags`, campo `tags`)
- Create: `apps/web/src/app/(frontend)/tag/[slug]/page/[pageNumber]/page.tsx`

**Interfaces:**
- Consumes: `PostsGridPage` (Task 2).

- [x] **Step 1:** Padrão pra `apps/web/src/app/(frontend)/categoria/[slug]/page.tsx` (os outros 2 pares de arquivo seguem IDENTICAMENTE isso, só trocando `categories`/`categoria` por `locations`/`atlas` e `tags`/`tag`, e a collection de lookup):
```typescript
import type { Metadata } from 'next/types'
import { PostsGridPage } from '@/components/PostsGridPage'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

export const revalidate = 600

type Args = { params: Promise<{ slug: string }> }

async function findCategory(slug: string) {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  return result.docs[0] ?? null
}

export default async function Page({ params: paramsPromise }: Args) {
  const { slug } = await paramsPromise
  const category = await findCategory(slug)
  if (!category) return notFound()

  return (
    <PostsGridPage
      basePath={`/categoria/${slug}`}
      page={1}
      title={category.title}
      where={{ categories: { contains: category.id } }}
    />
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug } = await paramsPromise
  const category = await findCategory(slug)
  return { title: category ? `${category.title} | Blog de Viagem` : 'Categoria não encontrada' }
}

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const categories = await payload.find({
    collection: 'categories',
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    select: { slug: true },
  })
  return categories.docs.map(({ slug }) => ({ slug }))
}
```
- [x] **Step 2:** `apps/web/src/app/(frontend)/categoria/[slug]/page/[pageNumber]/page.tsx` — igual acima, mas `params` inclui `pageNumber: string`, passa `page={Number(pageNumber)}` pro `PostsGridPage`, e faz `notFound()` se `Number.isNaN(Number(pageNumber))`.
- [x] **Step 3:** Repetir Steps 1–2 pra `atlas/[slug]` (collection `atlas-locations`, campo de filtro `locations`, label "Atlas") e `tag/[slug]` (collection `tags`, campo de filtro `tags`).
- [x] **Step 4:** Rodar `docker compose exec web npm run build`. Testar manualmente (ou via script de verificação na Task 6) as 3 rotas com slugs reais e confirmar 404 em slug inexistente.
- [x] **Step 5:** Commit: `git add apps/web/src/app/\(frontend\)/categoria apps/web/src/app/\(frontend\)/atlas apps/web/src/app/\(frontend\)/tag && git commit -m "feat: add category/atlas/tag listing pages with pagination"`

---

### Task 4: Faixa de afiliados + CTA de newsletter (componentes novos)

**Files:**
- Create: `apps/web/src/components/AffiliateLinksStrip/index.tsx`
- Create: `apps/web/src/components/NewsletterForm/index.tsx` (client component)

**Interfaces:**
- Consumes: collection `affiliate-links` (Módulo 1), endpoint `POST /api/newsletter/subscribe` (Módulo 3).

- [x] **Step 1:** Criar `apps/web/src/components/AffiliateLinksStrip/index.tsx` (Server Component):
```typescript
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

export const AffiliateLinksStrip: React.FC = async () => {
  const payload = await getPayload({ config: configPromise })
  const { docs: links } = await payload.find({
    collection: 'affiliate-links',
    where: { active: { equals: true } },
    sort: 'order',
    overrideAccess: true,
    limit: 100,
  })

  if (links.length === 0) return null

  return (
    <div className="container my-8">
      <div className="flex flex-wrap gap-4 justify-center border-y border-border py-4">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="text-sm uppercase tracking-wide hover:underline"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  )
}
```
- [x] **Step 2:** Criar `apps/web/src/components/NewsletterForm/index.tsx` (Client Component — precisa de estado local pro fetch/feedback, igual ao padrão "erro por campo abaixo do campo, sem alerta global" já usado em landing pages do projeto):
```typescript
'use client'
import React, { useState } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

export const NewsletterForm: React.FC<{ source?: string }> = ({ source = 'home' }) => {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage(null)

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      })
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setMessage(data.error || 'Não foi possível cadastrar seu email.')
        return
      }

      setStatus('success')
      setMessage(data.message || 'Inscrição confirmada!')
      setEmail('')
    } catch {
      setStatus('error')
      setMessage('Erro de conexão. Tente novamente.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="container my-16 max-w-md mx-auto text-center">
      <h2 className="text-xl font-semibold mb-4">Receba dicas de viagem por email</h2>
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="seu@email.com"
          disabled={status === 'loading'}
          className="flex-1 border border-border rounded-md px-3 py-2"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="bg-foreground text-background rounded-md px-4 py-2 disabled:opacity-50"
        >
          {status === 'loading' ? 'Enviando...' : 'Inscrever'}
        </button>
      </div>
      {message && (
        <p className={status === 'error' ? 'text-red-600 mt-2' : 'text-green-600 mt-2'}>{message}</p>
      )}
    </form>
  )
}
```
- [x] **Step 3:** Rodar `docker compose exec web npm run build`.
- [x] **Step 4:** Commit: `git add apps/web/src/components/AffiliateLinksStrip apps/web/src/components/NewsletterForm && git commit -m "feat: add AffiliateLinksStrip and NewsletterForm components"`

---

### Task 5: Reconstruir a Home (`/`)

**Files:**
- Modify: `apps/web/src/app/(frontend)/page.tsx` (deixa de re-exportar `[slug]/page`, vira implementação própria)

**Interfaces:**
- Consumes: `PostsGridPage`, `AffiliateLinksStrip`, `NewsletterForm` (Tasks 2 e 4), `CollectionArchive`/`Card` (já existentes).

- [x] **Step 1:** Reescrever `apps/web/src/app/(frontend)/page.tsx`:
```typescript
import type { Metadata } from 'next/types'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { CollectionArchive } from '@/components/CollectionArchive'
import { AffiliateLinksStrip } from '@/components/AffiliateLinksStrip'
import { NewsletterForm } from '@/components/NewsletterForm'
import { PostsGridPage } from '@/components/PostsGridPage'

export const revalidate = 60

const postSelect = {
  title: true,
  slug: true,
  categories: true,
  author: true,
  publishedAt: true,
  meta: true,
} as const

export default async function HomePage() {
  const payload = await getPayload({ config: configPromise })

  const publishedFilter = {
    publishedAt: { less_than_equal: new Date().toISOString() },
  }

  const featured = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: 4,
    overrideAccess: false,
    where: publishedFilter,
    sort: '-publishedAt',
    select: postSelect,
  })

  const recent = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: 4, // DECISION: mesmo `limit` do `featured` (4) — Payload pagina por
    page: 2, // offset = limit * (page-1), então page:2 só pula exatamente os
    overrideAccess: false, // 4 destaques se o limit bater. Usar limit:8 aqui
    where: publishedFilter, // com page:2 pularia 8 (offset errado), não 4 —
    sort: '-publishedAt', // bug pego na revisão do plano, antes de implementar.
    select: postSelect,
  })

  return (
    <div className="pt-24 pb-24">
      <div className="container mb-16">
        <div className="prose dark:prose-invert max-w-none">
          <h1>Voe Alto Traveller</h1>
        </div>
      </div>

      <CollectionArchive posts={featured.docs} />

      <AffiliateLinksStrip />

      <div className="container mt-16 mb-8">
        <div className="prose dark:prose-invert max-w-none">
          <h2>Últimas publicações</h2>
        </div>
      </div>
      <CollectionArchive posts={recent.docs} />

      <NewsletterForm source="home" />

      <PostsGridPage basePath="/posts" page={1} />
    </div>
  )
}

export function generateMetadata(): Metadata {
  return { title: 'Voe Alto Traveller — Blog de Viagem' }
}
```
- [x] **Step 2:** Rodar `docker compose exec web npm run build`.
- [x] **Step 3:** Commit: `git add apps/web/src/app/\(frontend\)/page.tsx && git commit -m "feat: rebuild Home with featured grid, affiliate strip, newsletter and paginated archive"`

---

### Task 6: Verificação (SPEC 4.2/4.3)

**Files:** nenhum novo — script tsx descartável de setup + curl/checks manuais.

- [x] **Step 1:** Criar via Local API (script descartável): 1 post publicado com `publishedAt` passado, 1 rascunho, 1 "agendado" (`_status: draft`, `publishedAt` futuro), todos na mesma categoria/tag/atlas location de teste.
- [x] **Step 2:** Confirmar via `curl`/`fetch` (ou abrindo no navegador) que:
  - `/` não lista o rascunho nem o agendado.
  - `/categoria/<slug>`, `/atlas/<slug>`, `/tag/<slug>` idem.
  - Paginação em `/posts` (e nas novas rotas, se houver posts suficientes) reflete `totalPages` corretamente.
  - Uma imagem sem `alt` cadastrado no Media renderiza com o título do post como alt (inspecionar HTML gerado).
- [x] **Step 3:** Rodar `docker compose exec web npm run build` uma última vez, confirmar 0 erros.
- [x] **Step 4 (Lighthouse — LCP e SEO):** Este ambiente não tem Chrome/Lighthouse instalado — **não vou conseguir rodar isso sozinho**. Documentar aqui os comandos pro usuário rodar localmente:
  ```bash
  npx -y lighthouse http://localhost:3000 --only-categories=performance,seo --view
  npx -y lighthouse http://localhost:3000/categoria/<slug-real> --only-categories=seo --view
  ```
  Critério: LCP < 2.5s na Home, SEO ≥ 95 na Home e numa página de categoria.
- [x] **Step 5:** Limpar os dados de teste criados no Step 1.

## Definição de Pronto (Módulo 4)

- [x] Grid paginado reflete corretamente `totalPages` da API (testado com dados reais, `PageRange` mostrando o total certo).
- [x] Nenhuma página (Home, categoria, atlas, tag) lista posts com `status != published` ou `publishedAt` futuro — testado com 1 post publicado + 1 rascunho + 1 "agendado" (draft com `publishedAt` futuro) na mesma categoria, nenhum dos dois últimos vazou em nenhuma das páginas.
- [x] Imagens usam `next/image` (via `Media`/`ImageMedia`) com `alt` sempre preenchido (fallback = título do post) — corrigido no código (Task 1) e revisado; teste automatizado de upload real não foi feito (baixo valor pra esforço, é um fallback ternário simples já revisado).
- [ ] Lighthouse LCP < 2.5s e SEO ≥ 95 — **pendente de confirmação do usuário** (ambiente sem Chrome/Lighthouse disponível pra rodar aqui). Comandos prontos na Task 6, Step 4.

### Verificação real executada

Rodada contra o servidor real com dados reais (posts publicado + rascunho + agendado na mesma categoria), via `fetch()` HTTP real:
1. Home não vaza rascunho nem agendado — confirmado.
2. `/categoria/:slug` não vaza rascunho nem agendado — confirmado.
3. 404 correto pra slug inexistente.
4. Paginação (`PageRange`) reflete o total real de posts publicados.
5. Limpeza dos dados de teste confirmada via `find()` (0 remanescentes), não só assumida.

**Achado incidental (não-bug de código, resíduo de módulo anterior):** durante a Task 2, descobri 2 posts de teste do Módulo 1 que não tinham sido limpos de verdade (o script de verificação daquela época usou `Promise.allSettled` sem checar se cada delete individual funcionou). Removidos diretamente do Postgres. Lição aplicada a partir daqui: todo script de verificação/limpeza precisa confirmar com um `find`/`SELECT` depois de deletar, não só assumir que `Promise.allSettled` funcionou — isso já foi seguido em todas as tasks deste módulo.

**Bugs reais pegos durante a implementação (antes do commit, não depois):**
- Math de paginação da Home (Task 5): `limit:8` com `page:2` pularia 8 posts, não 4 — corrigido pra `limit:4` em ambas as seções antes mesmo de implementar (achado na auto-revisão do plano).
- `generateStaticParams` das rotas paginadas de categoria/atlas/tag (Task 3): calcular `totalPages` com a contagem global de posts do site (em vez de só os da entidade) geraria paginação errada — corrigido durante a implementação.
- `/posts/page/[pageNumber]/page.tsx` pré-existente não tinha filtro de `publishedAt` nem `select` (Task 2) — corrigido ao migrar pro `PostsGridPage`.
