import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, afterAll, expect } from 'vitest'

import type { Author, AtlasLocation, Category, Post } from '@/payload-types'

// DECISION: chamadas HTTP reais contra o servidor `next dev` já rodando no
// container (ver Decisão 2 do plano — sem supertest, `fetch` nativo do Node).
const BASE_URL = 'http://localhost:3000'

// DECISION: sufixo único por execução — evita colisão de slug/email `unique`
// com dados deixados por uma execução anterior que não tenha limpado
// corretamente (ex.: interrupção no meio do teste).
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// DECISION: `getClientIp` só olha o header `x-forwarded-for` — sem ele, todas
// as requisições feitas de dentro do container caem no mesmo bucket
// `newsletter:unknown`. Para não conflitar com outros testes deste arquivo
// (ou execuções anteriores, já que o rate limiter vive na memória do processo
// do servidor `next dev`, não do processo do Vitest, e não é resetado entre
// execuções), cada bloco de cenário do newsletter usa um X-Forwarded-For
// fabricado e único por execução.
const dedupIp = `test-dedup-${RUN_ID}`
const rateLimitIp = `test-ratelimit-${RUN_ID}`

// Documento Lexical mínimo válido para o campo `content` (richText, required).
const minimalLexicalContent = {
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'text',
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'Conteúdo de teste.',
            version: 1,
          },
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        version: 1,
      },
    ],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1,
  },
}

let payload: Payload

let author: Author
let category: Category
let otherCategory: Category
let atlasLocation: AtlasLocation
let otherAtlasLocation: AtlasLocation
let publishedPost: Post
let scheduledPost: Post

describe('Public Content API (integration, HTTP real)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    author = await payload.create({
      collection: 'authors',
      data: { title: `Autor de Teste ${RUN_ID}`, slug: `autor-teste-${RUN_ID}` },
      context: { disableRevalidate: true },
    })

    category = await payload.create({
      collection: 'categories',
      data: { title: `Categoria de Teste ${RUN_ID}`, slug: `categoria-teste-${RUN_ID}` },
      context: { disableRevalidate: true },
    })

    otherCategory = await payload.create({
      collection: 'categories',
      data: {
        title: `Categoria Sem Posts ${RUN_ID}`,
        slug: `categoria-sem-posts-${RUN_ID}`,
      },
      context: { disableRevalidate: true },
    })

    atlasLocation = await payload.create({
      collection: 'atlas-locations',
      data: {
        title: `Localização de Teste ${RUN_ID}`,
        type: 'country',
        slug: `localizacao-teste-${RUN_ID}`,
      },
      context: { disableRevalidate: true },
    })

    otherAtlasLocation = await payload.create({
      collection: 'atlas-locations',
      data: {
        title: `Localização Sem Posts ${RUN_ID}`,
        type: 'country',
        slug: `localizacao-sem-posts-${RUN_ID}`,
      },
      context: { disableRevalidate: true },
    })

    // Post publicado no passado — deve aparecer em todas as listagens públicas.
    publishedPost = await payload.create({
      collection: 'posts',
      data: {
        title: `Post Publicado ${RUN_ID}`,
        slug: `post-publicado-${RUN_ID}`,
        _status: 'published',
        publishedAt: new Date(Date.now() - 60_000).toISOString(),
        content: minimalLexicalContent,
        author: author.id,
        categories: [category.id],
        locations: [atlasLocation.id],
      },
      context: { disableRevalidate: true },
    })

    // Post "agendado": rascunho com publishedAt no futuro — não pode vazar em
    // NENHUM endpoint público (SPEC: agendado só aparece quando o job publicar).
    scheduledPost = await payload.create({
      collection: 'posts',
      data: {
        title: `Post Agendado ${RUN_ID}`,
        slug: `post-agendado-${RUN_ID}`,
        _status: 'draft',
        publishedAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        content: minimalLexicalContent,
        author: author.id,
        categories: [category.id],
        locations: [atlasLocation.id],
      },
      context: { disableRevalidate: true },
    })
  })

  afterAll(async () => {
    await payload.delete({
      collection: 'posts',
      where: { id: { in: [publishedPost.id, scheduledPost.id] } },
      context: { disableRevalidate: true },
    })
    await payload.delete({
      collection: 'categories',
      where: { id: { in: [category.id, otherCategory.id] } },
      context: { disableRevalidate: true },
    })
    await payload.delete({
      collection: 'atlas-locations',
      where: { id: { in: [atlasLocation.id, otherAtlasLocation.id] } },
      context: { disableRevalidate: true },
    })
    await payload.delete({
      collection: 'authors',
      where: { id: { equals: author.id } },
      context: { disableRevalidate: true },
    })
    await payload.delete({
      collection: 'newsletter-subscribers',
      where: { source: { equals: RUN_ID } },
      context: { disableRevalidate: true },
    })
  })

  describe('GET /api/posts', () => {
    it('retorna o formato paginado nativo e nunca vaza posts não publicados', async () => {
      const res = await fetch(`${BASE_URL}/api/posts?limit=100`)
      expect(res.status).toBe(200)

      const body = await res.json()

      expect(body).toHaveProperty('docs')
      expect(body).toHaveProperty('totalDocs')
      expect(body).toHaveProperty('page')
      expect(body).toHaveProperty('totalPages')
      expect(body).toHaveProperty('hasNextPage')
      expect(Array.isArray(body.docs)).toBe(true)

      const docs = body.docs as Array<{ id: number; _status?: string }>
      for (const doc of docs) {
        expect(doc._status).toBe('published')
      }

      expect(docs.some((doc) => doc.id === scheduledPost.id)).toBe(false)
      expect(docs.some((doc) => doc.id === publishedPost.id)).toBe(true)
    })
  })

  describe('GET /api/posts/by-slug/:slug', () => {
    it('retorna 200 com o post certo para um post publicado', async () => {
      const res = await fetch(`${BASE_URL}/api/posts/by-slug/${publishedPost.slug}`)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.id).toBe(publishedPost.id)
      expect(body.slug).toBe(publishedPost.slug)
      expect(body._status).toBe('published')
    })

    it('retorna 404 para um post agendado (draft com publishedAt no futuro)', async () => {
      const res = await fetch(`${BASE_URL}/api/posts/by-slug/${scheduledPost.slug}`)
      expect(res.status).toBe(404)

      const body = await res.json()
      expect(body).toHaveProperty('error')
    })

    it('continua retornando 404 (não 500) para um slug inexistente', async () => {
      const res = await fetch(`${BASE_URL}/api/posts/by-slug/slug-que-nao-existe-${RUN_ID}`)
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/categories/:slug/posts', () => {
    it('retorna só posts publicados daquela categoria, no formato paginado', async () => {
      const res = await fetch(`${BASE_URL}/api/categories/${category.slug}/posts`)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body).toHaveProperty('docs')
      expect(body).toHaveProperty('totalDocs')
      expect(body).toHaveProperty('page')
      expect(body).toHaveProperty('totalPages')
      expect(body).toHaveProperty('hasNextPage')

      const docs = body.docs as Array<{ id: number; _status?: string }>
      expect(docs.some((doc) => doc.id === publishedPost.id)).toBe(true)
      expect(docs.some((doc) => doc.id === scheduledPost.id)).toBe(false)
      for (const doc of docs) {
        expect(doc._status).toBe('published')
      }
    })

    it('retorna lista vazia para uma categoria sem posts publicados', async () => {
      const res = await fetch(`${BASE_URL}/api/categories/${otherCategory.slug}/posts`)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.docs).toEqual([])
    })

    it('retorna 404 para uma categoria inexistente', async () => {
      const res = await fetch(`${BASE_URL}/api/categories/categoria-inexistente-${RUN_ID}/posts`)
      expect(res.status).toBe(404)
    })
  })

  describe('GET /api/atlas/:slug/posts', () => {
    it('retorna só posts publicados daquela localização, no formato paginado', async () => {
      const res = await fetch(`${BASE_URL}/api/atlas/${atlasLocation.slug}/posts`)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body).toHaveProperty('docs')
      expect(body).toHaveProperty('totalDocs')
      expect(body).toHaveProperty('page')
      expect(body).toHaveProperty('totalPages')
      expect(body).toHaveProperty('hasNextPage')

      const docs = body.docs as Array<{ id: number; _status?: string }>
      expect(docs.some((doc) => doc.id === publishedPost.id)).toBe(true)
      expect(docs.some((doc) => doc.id === scheduledPost.id)).toBe(false)
      for (const doc of docs) {
        expect(doc._status).toBe('published')
      }
    })

    it('retorna lista vazia para uma localização sem posts publicados', async () => {
      const res = await fetch(`${BASE_URL}/api/atlas/${otherAtlasLocation.slug}/posts`)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.docs).toEqual([])
    })

    it('retorna 404 para uma localização inexistente', async () => {
      const res = await fetch(`${BASE_URL}/api/atlas/localizacao-inexistente-${RUN_ID}/posts`)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/newsletter/subscribe — cadastro e deduplicação', () => {
    const newEmail = `lead-${RUN_ID}@example.com`

    it('cadastra um email novo com 201', async () => {
      const res = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': dedupIp,
        },
        body: JSON.stringify({ email: newEmail, source: RUN_ID }),
      })

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body).toHaveProperty('id')
    })

    it('retorna 200 com mensagem amigável ao tentar cadastrar o mesmo email de novo (não 500)', async () => {
      const res = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': dedupIp,
        },
        body: JSON.stringify({ email: newEmail, source: RUN_ID }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
      expect(typeof body.message).toBe('string')
    })

    it('retorna 400 para email malformado', async () => {
      const res = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': dedupIp,
        },
        body: JSON.stringify({ email: 'nao-e-um-email', source: RUN_ID }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body).toHaveProperty('error')
    })
  })

  // DECISION: describe próprio, com um X-Forwarded-For exclusivo (nunca usado
  // nos testes de dedup acima), pra não disparar 429 nos outros cenários e
  // vice-versa — o rate limiter é um Map em memória do processo do servidor
  // `next dev` (não é resetado por teste nem por arquivo).
  describe('POST /api/newsletter/subscribe — rate limit (5 req/min/IP)', () => {
    it('permite as primeiras 5 requisições e bloqueia a 6ª com 429', async () => {
      const statuses: number[] = []

      for (let i = 0; i < 6; i += 1) {
        const res = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': rateLimitIp,
          },
          body: JSON.stringify({ email: `lead-rate-${RUN_ID}-${i}@example.com`, source: RUN_ID }),
        })
        statuses.push(res.status)
      }

      expect(statuses.slice(0, 5)).toEqual([201, 201, 201, 201, 201])
      expect(statuses[5]).toBe(429)

      const res = await fetch(`${BASE_URL}/api/newsletter/subscribe`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': rateLimitIp,
        },
        body: JSON.stringify({ email: `lead-rate-extra-${RUN_ID}@example.com`, source: RUN_ID }),
      })
      expect(res.status).toBe(429)
      const body = await res.json()
      expect(body).toHaveProperty('error')
    })
  })
})
