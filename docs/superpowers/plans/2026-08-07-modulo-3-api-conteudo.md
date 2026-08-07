# Módulo 3 — API de Conteúdo (consumida pelo front) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** os 5 endpoints do SPEC 3.1 funcionando, nunca vazando rascunho/agendado, com paginação no formato nativo do Payload e rate limit no cadastro de newsletter — cobertos por testes de integração reais (HTTP, não só Local API).

**Architecture:** `GET /api/posts` já funciona nativamente (Payload autogera list+paginação); os outros 4 são **custom endpoints** do Payload (`CollectionConfig.endpoints` ou `buildConfig.endpoints` globais), servidos pelo mesmo catch-all `app/(payload)/api/[...slug]/route.ts` já gerado — **não mexer nesse arquivo** (é auto-gerado, o comentário no topo pede pra não modificar).

**Tech Stack:** Payload 3 custom `endpoints`, Postgres, Vitest (padrão já usado em `tests/int/`), `fetch` nativo do Node 20 (sem supertest — ver Decisão 2).

## Global Constraints

- Rodar build/test sempre via `docker compose exec web ...` (Postgres não exposto ao host).
- Nenhuma dependência nova instalada sem necessidade real (ver Decisões 1 e 2 — nem Zod nem supertest entram neste módulo).
- Todo endpoint público (sem usuário autenticado) deve filtrar explicitamente `_status: published` **e** `publishedAt <= now()` — dupla checagem mesmo já existindo `access.read` nas collections, porque esses endpoints custom podem futuramente ser chamados com `overrideAccess: true` internamente e não se pode depender só do access control de fora.

## Decisões desta revisão

1. **Validação de email sem Zod:** o campo `NewsletterSubscribers.email` já é `type: 'email'` — o próprio Payload valida formato e lança `ValidationError` (não crash) se malformado. Não adiciono Zod como dependência nova só pra isso; capturo o erro do Payload e traduzo pra uma resposta HTTP limpa.
2. **Testes de integração sem supertest:** o padrão já existente em `tests/int/api.int.spec.ts` usa Vitest + Local API do Payload direto (sem HTTP real). Mas os custom endpoints deste módulo só existem de verdade como rotas HTTP — testar só via Local API não prova que a rota/formato de resposta funciona. Uso `fetch()` nativo do Node contra `http://localhost:3000` (o próprio servidor já rodando no container, acessível de dentro dele) em vez de instalar `supertest` — mesmo resultado (requisição HTTP real), zero dependência nova.
3. **Risco de colisão de rota em `/api/posts/:slug`:** o Payload já expõe `/api/posts/:id` nativamente (busca por ID). Um custom endpoint no mesmo formato de path (`/:slug`) pode colidir. **Vou testar isso na prática na Task 2** antes de dar a task como concluída — se colidir, o fallback documentado é `/api/posts/by-slug/:slug` (divergência a registrar se acontecer, não assumida de antemão).
4. **Rate limit em memória, não distribuído:** limiter simples (`Map` em memória do processo), 5 req/min/IP conforme sugestão do SPEC. Funciona para 1 instância (nosso caso — 1 container `web`). Documentado como limitação conhecida caso o deploy futuro escale horizontalmente (Redis ou similar resolveria, fora de escopo do MVP).

---

### Task 1: Utilitário de rate limit

**Files:**
- Create: `apps/web/src/utilities/rateLimit.ts`

**Interfaces:**
- Produces: `checkRateLimit(key: string, opts?: { limit?: number; windowMs?: number }): { allowed: boolean; remaining: number }`, usado na Task 4.

- [ ] **Step 1:** Criar `apps/web/src/utilities/rateLimit.ts`:
```typescript
// DECISION: limiter em memória (Map), não distribuído — suficiente pra 1
// instância do container `web`. Se o deploy escalar horizontalmente, trocar
// por um store compartilhado (Redis, etc.) — fora de escopo do MVP.
const hits = new Map<string, { count: number; windowStart: number }>()

export function checkRateLimit(
  key: string,
  { limit = 5, windowMs = 60_000 }: { limit?: number; windowMs?: number } = {},
): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = hits.get(key)

  if (!entry || now - entry.windowStart > windowMs) {
    hits.set(key, { count: 1, windowStart: now })
    return { allowed: true, remaining: limit - 1 }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 }
  }

  entry.count += 1
  return { allowed: true, remaining: limit - entry.count }
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return 'unknown'
}
```
- [ ] **Step 2:** Commit: `git add apps/web/src/utilities/rateLimit.ts && git commit -m "feat: add in-memory rate limit utility"`

---

### Task 2: `GET /api/posts/:slug`

**Files:**
- Create: `apps/web/src/collections/Posts/endpoints/getBySlug.ts`
- Modify: `apps/web/src/collections/Posts/index.ts` (registrar em `endpoints: []`)

**Interfaces:**
- Produces: `GET /api/posts/:slug` → 200 com o post publicado, ou 404.

- [ ] **Step 1:** Criar `apps/web/src/collections/Posts/endpoints/getBySlug.ts`:
```typescript
import type { PayloadHandler } from 'payload'

export const getPostBySlug: PayloadHandler = async (req) => {
  const slug = req.routeParams?.slug
  if (typeof slug !== 'string') {
    return Response.json({ error: 'Slug inválido' }, { status: 400 })
  }

  const result = await req.payload.find({
    collection: 'posts',
    where: {
      slug: { equals: slug },
      _status: { equals: 'published' },
      publishedAt: { less_than_equal: new Date().toISOString() },
    },
    limit: 1,
    overrideAccess: false,
    req,
  })

  const doc = result.docs[0]
  if (!doc) {
    return Response.json({ error: 'Post não encontrado' }, { status: 404 })
  }

  return Response.json(doc)
}
```
- [ ] **Step 2:** Em `Posts/index.ts`, adicionar:
```typescript
import { getPostBySlug } from './endpoints/getBySlug'
// ...
endpoints: [
  {
    path: '/:slug',
    method: 'get',
    handler: getPostBySlug,
  },
],
```
- [ ] **Step 3 (verificação de colisão — Decisão 3):** Rodar `docker compose exec web npm run build`, subir/confirmar hot-reload, e testar manualmente:
  - `curl http://localhost:3000/api/posts/<slug-de-um-post-publicado-real>` → deve retornar o post (200), não um erro de "ID inválido" nem 404 incorreto.
  - `curl http://localhost:3000/api/posts/<algum-id-numerico-existente>` → confirmar que o endpoint nativo de busca por ID **continua funcionando** (não foi quebrado pelo custom endpoint).
  - Se qualquer um dos dois falhar por colisão de rota, mudar o path pra `/by-slug/:slug` (endpoint fica em `/api/posts/by-slug/:slug`), documentar a divergência aqui no plano com um `DECISION`, e re-testar.
- [ ] **Step 4:** Commit: `git add apps/web/src/collections/Posts && git commit -m "feat: add GET /api/posts/:slug custom endpoint"`

---

### Task 3: `GET /api/categories/:slug/posts` e `GET /api/atlas/:slug/posts`

**Files:**
- Create: `apps/web/src/collections/Categories.ts` → endpoint inline (ou arquivo próprio, ver Step 1)
- Create: `apps/web/src/endpoints/getPostsByAtlasLocation.ts`
- Modify: `apps/web/src/collections/Categories.ts`, `apps/web/src/payload.config.ts`

**Interfaces:**
- Produces: `GET /api/categories/:slug/posts` e `GET /api/atlas/:slug/posts`, ambos retornando o formato paginado nativo (`{ docs, totalDocs, page, totalPages, hasNextPage }`).

- [ ] **Step 1:** Criar `apps/web/src/collections/Categories/endpoints/getPosts.ts` (mover `Categories.ts` pra pasta `Categories/index.ts` só se necessário — **preferir manter `Categories.ts` como arquivo único e colocar a função no mesmo arquivo ou em `apps/web/src/endpoints/getPostsByCategory.ts`, o que for menos invasivo** — decidir na hora olhando o arquivo atual):
```typescript
import type { PayloadHandler } from 'payload'

export const getPostsByCategorySlug: PayloadHandler = async (req) => {
  const slug = req.routeParams?.slug
  if (typeof slug !== 'string') {
    return Response.json({ error: 'Slug inválido' }, { status: 400 })
  }

  const category = await req.payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })

  if (!category.docs[0]) {
    return Response.json({ error: 'Categoria não encontrada' }, { status: 404 })
  }

  const page = Number(req.query?.page) || 1
  const limit = Number(req.query?.limit) || 12

  const posts = await req.payload.find({
    collection: 'posts',
    where: {
      categories: { contains: category.docs[0].id },
      _status: { equals: 'published' },
      publishedAt: { less_than_equal: new Date().toISOString() },
    },
    page,
    limit,
    overrideAccess: false,
    req,
  })

  return Response.json(posts)
}
```
- [ ] **Step 2:** Registrar em `Categories.ts` (`endpoints: [{ path: '/:slug/posts', method: 'get', handler: getPostsByCategorySlug }]`) — path final `/api/categories/:slug/posts`, sem colisão (o default de Categories não tem sufixo `/posts`).
- [ ] **Step 3:** Criar `apps/web/src/endpoints/getPostsByAtlasLocation.ts`, mesma lógica trocando `categories`/`category` por `atlas-locations`/`locations`:
```typescript
import type { PayloadHandler } from 'payload'

export const getPostsByAtlasLocation: PayloadHandler = async (req) => {
  const slug = req.routeParams?.slug
  if (typeof slug !== 'string') {
    return Response.json({ error: 'Slug inválido' }, { status: 400 })
  }

  const location = await req.payload.find({
    collection: 'atlas-locations',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })

  if (!location.docs[0]) {
    return Response.json({ error: 'Localização não encontrada' }, { status: 404 })
  }

  const page = Number(req.query?.page) || 1
  const limit = Number(req.query?.limit) || 12

  const posts = await req.payload.find({
    collection: 'posts',
    where: {
      locations: { contains: location.docs[0].id },
      _status: { equals: 'published' },
      publishedAt: { less_than_equal: new Date().toISOString() },
    },
    page,
    limit,
    overrideAccess: false,
    req,
  })

  return Response.json(posts)
}
```
- [ ] **Step 4:** Registrar como endpoint **global** em `payload.config.ts` (não é collection-scoped — o path público `/atlas/...` é diferente do slug real da collection `atlas-locations`):
```typescript
import { getPostsByAtlasLocation } from './endpoints/getPostsByAtlasLocation'
// ...
endpoints: [
  {
    path: '/atlas/:slug/posts',
    method: 'get',
    handler: getPostsByAtlasLocation,
  },
],
```
- [ ] **Step 5:** Rodar `docker compose exec web npm run build`, testar os dois com `curl` manualmente (categoria e atlas location reais).
- [ ] **Step 6:** Commit: `git add apps/web/src/collections/Categories.ts apps/web/src/endpoints/getPostsByAtlasLocation.ts apps/web/src/payload.config.ts && git commit -m "feat: add GET /api/categories/:slug/posts and /api/atlas/:slug/posts"` (ajustar paths dos arquivos conforme decidido no Step 1).

---

### Task 4: `POST /api/newsletter/subscribe`

**Files:**
- Create: `apps/web/src/endpoints/subscribeNewsletter.ts`
- Modify: `apps/web/src/payload.config.ts`

**Interfaces:**
- Consumes: `checkRateLimit`, `getClientIp` (Task 1).
- Produces: `POST /api/newsletter/subscribe` → 201 (novo), 200 (já inscrito, mensagem amigável), 400 (email malformado), 429 (rate limit).

- [ ] **Step 1:** Criar `apps/web/src/endpoints/subscribeNewsletter.ts`:
```typescript
import type { PayloadHandler } from 'payload'
import { checkRateLimit, getClientIp } from '../utilities/rateLimit'

export const subscribeNewsletter: PayloadHandler = async (req) => {
  const ip = getClientIp(req)
  const rateLimit = checkRateLimit(`newsletter:${ip}`, { limit: 5, windowMs: 60_000 })

  if (!rateLimit.allowed) {
    return Response.json(
      { error: 'Muitas tentativas. Tente novamente em instantes.' },
      { status: 429 },
    )
  }

  let body: { email?: unknown; source?: unknown }
  try {
    body = (await req.json?.()) ?? {}
  } catch {
    return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const source = typeof body.source === 'string' ? body.source : undefined

  if (!email) {
    return Response.json({ error: 'Email é obrigatório' }, { status: 400 })
  }

  try {
    const doc = await req.payload.create({
      collection: 'newsletter-subscribers',
      data: { email, source },
      overrideAccess: true,
    })
    return Response.json({ success: true, id: doc.id }, { status: 201 })
  } catch (err) {
    // DECISION: Payload lança ValidationError tanto pra email malformado
    // (o campo é type: 'email') quanto pra duplicado (unique: true) — checa
    // a mensagem pra dar a resposta amigável certa em cada caso, sem nunca
    // deixar a exceção virar 500.
    const message = err instanceof Error ? err.message : String(err)

    if (message.toLowerCase().includes('unique')) {
      return Response.json({ success: true, message: 'Você já está inscrito.' }, { status: 200 })
    }

    return Response.json({ error: 'Email inválido' }, { status: 400 })
  }
}
```
- [ ] **Step 2:** Registrar em `payload.config.ts`:
```typescript
import { subscribeNewsletter } from './endpoints/subscribeNewsletter'
// ...
endpoints: [
  { path: '/atlas/:slug/posts', method: 'get', handler: getPostsByAtlasLocation },
  { path: '/newsletter/subscribe', method: 'post', handler: subscribeNewsletter },
],
```
- [ ] **Step 3:** Rodar `docker compose exec web npm run build`, testar manualmente com `curl -X POST` (email válido novo, email duplicado, email malformado, e 6 requests seguidas pra confirmar o 429 na 6ª).
- [ ] **Step 4:** Commit: `git add apps/web/src/endpoints/subscribeNewsletter.ts apps/web/src/payload.config.ts && git commit -m "feat: add POST /api/newsletter/subscribe with rate limit and dedup"`

---

### Task 5: Testes de integração (5 endpoints, incluindo agendado não vazar)

**Files:**
- Create: `apps/web/tests/int/publicApi.int.spec.ts`

**Interfaces:**
- Consumes: servidor real em `http://localhost:3000` (mesmo container, `next dev` já rodando).

- [ ] **Step 1:** Escrever `apps/web/tests/int/publicApi.int.spec.ts` cobrindo, via `fetch()` real (não Local API):
  1. `GET /api/posts` retorna `{ docs, totalDocs, page, totalPages, hasNextPage }` e nenhum doc com `_status !== 'published'`.
  2. `GET /api/posts/:slug` de um post publicado retorna 200 com o post certo.
  3. `GET /api/posts/:slug` de um post com `_status: 'draft'` e `publishedAt` no **futuro** retorna 404 (o caso "agendado não aparece antes da hora" do SPEC).
  4. `GET /api/categories/:slug/posts` retorna só posts publicados daquela categoria.
  5. `GET /api/atlas/:slug/posts` retorna só posts publicados daquela localização.
  6. `POST /api/newsletter/subscribe` com email novo → 201; mesmo email de novo → 200 com mensagem amigável (não 500); email malformado → 400.
  7. 6 requisições seguidas em `/api/newsletter/subscribe` → a 6ª retorna 429.
  - Setup/teardown via Local API do Payload (`overrideAccess: true`) pra criar/limpar os dados de teste (post publicado, post agendado, categoria, atlas location) — só as chamadas às rotas em si usam `fetch()` real.
- [ ] **Step 2:** Rodar `docker compose exec web npm run test:int` e confirmar que os 7 cenários passam.
- [ ] **Step 3:** Commit: `git add apps/web/tests/int/publicApi.int.spec.ts && git commit -m "test: add integration tests for public content API endpoints"`

## Definição de Pronto (Módulo 3)

- [ ] Nenhum endpoint de leitura vaza rascunho ou agendado (testado, não só assumido).
- [ ] Newsletter rejeita duplicado (mensagem amigável, não 500) e malformado (400), com rate limit 5/min/IP funcionando.
- [ ] Respostas paginadas no formato `{ docs, totalDocs, page, totalPages, hasNextPage }`.
- [ ] Testes de integração automatizados cobrindo os 5 endpoints, incluindo o caso de agendado, rodando e passando via `npm run test:int`.
